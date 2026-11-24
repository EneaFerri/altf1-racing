/// Complete simulation state (`sim/game.ts`). Plain data only, so it can be copied, compared and
/// sent over the network.
public struct GameState: Codable, Hashable, Sendable {
    /// Number of fixed steps simulated so far.
    public var tick: Int
    /// Sorted by id, so every machine updates them in the same order.
    public var cars: [CarState]
    /// Impacts that happened during the last tick only (empty most of the time).
    public var impacts: [ImpactEvent]
    /// Lap timing, one per car, in the same order as `cars`.
    public var laps: [LapState]

    public init(tick: Int, cars: [CarState], impacts: [ImpactEvent], laps: [LapState]) {
        self.tick = tick
        self.cars = cars
        self.impacts = impacts
        self.laps = laps
    }

    public func car(_ id: CarId) -> CarState? { cars.first { $0.id == id } }

    public func lap(_ id: CarId) -> LapState? { laps.first { $0.carId == id } }
}

/// Static data the simulation reads but never changes. Not part of `GameState`.
public struct SimContext: Sendable {
    public var track: Track
    public var carParams: CarParams
    /// Cars that drive a different car than `carParams` (e.g. a bot with a performance edge).
    public var carParamsById: [CarId: CarParams]?
    public var surfaceParams: SurfaceTable
    public var collisionParams: CollisionParams
    public var slipstreamParams: SlipstreamParams
    /// Slopes on an elevated track; nil: `SlopeParams.baseline`.
    public var slopeParams: SlopeParams?
    /// Cars take damage (the Grand Prix only); nil: no damage, no `CarState.damage`.
    public var damage: DamageParams?
    /// The pit lane's rules (the Grand Prix, on a track built with its pit lane); nil: neither.
    public var pit: PitRules?
    /// A wet track (the rain); nil: dry.
    public var weather: WetTrack?
    /// Tyre compounds and wear (the Grand Prix, with its pit lane); nil: as on new mediums.
    public var tyres: TyreParams?

    public init(
        track: Track, carParams: CarParams = .baseline, carParamsById: [CarId: CarParams]? = nil,
        surfaceParams: SurfaceTable = .baseline, collisionParams: CollisionParams = .baseline,
        slipstreamParams: SlipstreamParams = .baseline, slopeParams: SlopeParams? = nil,
        damage: DamageParams? = nil, pit: PitRules? = nil, weather: WetTrack? = nil, tyres: TyreParams? = nil
    ) {
        self.track = track
        self.carParams = carParams
        self.carParamsById = carParamsById
        self.surfaceParams = surfaceParams
        self.collisionParams = collisionParams
        self.slipstreamParams = slipstreamParams
        self.slopeParams = slopeParams
        self.damage = damage
        self.pit = pit
        self.weather = weather
        self.tyres = tyres
    }
}

/// A grid slot counts as free when no car is closer than this to it (m).
private let spawnClearance: Double = 6

/// One input per car id; cars without an entry get `InputCommand.neutral`.
public typealias InputMap = [CarId: InputCommand]

/// New race: cars on the starting grid in the given order (first = pole position).
public func createGame(_ track: Track, _ carIds: [CarId]) -> GameState {
    let cars = carIds.enumerated().map { slot, id in
        let pose = gridSlot(track, slot)
        return CarState(id: id, position: pose.position, heading: pose.direction.heading)
    }
    let sorted = sortById(cars)
    return GameState(
        tick: 0, cars: sorted, impacts: [],
        laps: sorted.map { LapState(carId: $0.id, distance: locateOnTrack(track, $0.position).distance) })
}

/// Advances the simulation by exactly one fixed tick. Pure. Every car moves first (towed by the
/// wakes of the cars as they were at the start of the tick), then one collision pass, then (with
/// damage) each car's impacts and off-track wheels damage it, then (with the pit lane's rules)
/// each car's pit stop moves on, then lap timing reads where each car ended up.
public func stepGame(_ state: GameState, _ inputs: InputMap, _ ctx: SimContext) -> GameState {
    let moved = state.cars.map { car -> CarState in
        // Stopped in its box: held still, whatever its controls (R too).
        if ctx.pit != nil && inBox(car, state.tick) {
            return heldInBox(car, compound: ctx.tyres != nil ? inputs[car.id]?.compound : nil)
        }
        let given = inputs[car.id] ?? .neutral
        if given.reset { return resetOnTrack(car, ctx.track) }

        let surface = carSurface(ctx.track, car, ctx.surfaceParams)
        let effect =
            ctx.weather.map { wetSurfaceEffect(surface.effect, puddleShare(car, $0.puddles), $0.params) }
            ?? surface.effect
        let own = ctx.carParamsById?[car.id] ?? ctx.carParams
        // A damaged car (only with ctx.damage) drives slower, turns and grips less, and may pull.
        var params = own
        var input = given
        if let damage = ctx.damage, let carDamage = car.damage {
            params = damagedParams(own, carDamage, damage)
            input = damagedInput(given, carDamage, damage)
        }
        // Its tyres (only with ctx.tyres): the compound's grip and traction, less as they wear.
        if let tyres = ctx.tyres { params = tyredParams(params, car.tyres ?? .newMediums, tyres) }
        let slipstream = slipstreamFactor(car, state.cars, ctx.slipstreamParams)
        let slip = slipstreamEffect(slipstream, ctx.slipstreamParams)
        var next = stepCar(
            car, input, params, fixedDt, surface: effect, slip: slip, slopeAccel: slopeAccel(car, ctx))
        next.wheelSurfaces = surface.surfaces
        next.slipstream = slipstream
        if let tyres = ctx.tyres {
            next.tyres = wearTyres(car.tyres ?? .newMediums, next.velocity.length * fixedDt, ctx.track.length, tyres)
        }
        return ctx.pit != nil ? limitedSpeed(next, ctx.track) : next
    }
    let resolved = resolveCollisions(moved, ctx.track, ctx.collisionParams, state.cars)
    let impacts = resolved.impacts
    let tick = state.tick + 1
    var cars = resolved.cars
    if let damage = ctx.damage {
        cars = cars.map { car in
            var next = car
            next.damage = stepDamage(car, impacts, fixedDt, damage)
            return next
        }
    }
    if let pit = ctx.pit {
        let damaged = cars
        cars = damaged.map { pitStep($0, ctx.track, tick, pit, damaged) }
    }
    let laps = state.laps.enumerated().map { i, lap in
        stepLap(
            lap, locateOnTrack(ctx.track, cars[i].position).distance, inputs[lap.carId]?.reset ?? false,
            tick, ctx.track)
    }
    return GameState(tick: tick, cars: cars, impacts: impacts, laps: laps)
}

/// Gravity along the slope under `car`, along its heading (m/s², + = forward). 0 on a flat track,
/// which is never even located.
private func slopeAccel(_ car: CarState, _ ctx: SimContext) -> Double {
    if !ctx.track.elevated { return 0 }
    let slope = ctx.slopeParams ?? .baseline
    let loc = locateOnTrack(ctx.track, car.position)
    return -slope.gravity * slope.factor * loc.grade * Vec2.forward(car.heading).dot(loc.tangent)
}

/// Puts car `id` at rest on the centreline `metres` along the track from car `targetId` (negative =
/// behind), facing the driving direction, with its timing back to an out-lap. Adds the car if it
/// isn't in the race yet; `state` unchanged if `targetId` is missing.
public func placeCar(_ state: GameState, _ track: Track, _ id: CarId, _ targetId: CarId, _ metres: Double)
    -> GameState
{
    guard let target = state.car(targetId) else { return state }
    let samples = track.samples
    let n = samples.count
    // Start from the main-loop sample at the target's progress (the target may be on a branch).
    let progress = locateOnTrack(track, target.position).distance
    var start = 0
    for i in 0..<n where abs(samples[i].distance - progress) < abs(samples[start].distance - progress) {
        start = i
    }
    let step = metres >= 0 ? 1 : n - 1
    var index = start
    // Walk sample by sample in the chosen direction, wrapping over the start line.
    while jsMod(
        jsSign(metres) * (samples[index].distance - samples[start].distance) + track.length, track.length)
        < abs(metres)
    {
        index = (index + step) % n
        if index == start { break }
    }
    let sample = samples[index]
    let placed = CarState(id: id, position: sample.position, heading: sample.tangent.heading)
    // A teleport must not count as crossing a sector: the moved car starts a fresh out-lap.
    let timing = LapState(carId: id, distance: sample.distance)
    let cars = sortById(state.cars.filter { $0.id != id } + [placed])
    let laps = cars.map { car in car.id == id ? timing : state.lap(car.id)! }
    var next = state
    next.cars = cars
    next.laps = laps
    return next
}

/// Adds car `id` at rest on the first grid slot with no car near it, with its timing on an
/// out-lap (replaces the car if `id` is already there). Used when a player joins a room.
public func spawnOnGrid(_ state: GameState, _ track: Track, _ id: CarId) -> GameState {
    let others = removeCar(state, id)
    var slot = 0
    while others.cars.contains(where: { $0.position.distance(to: gridSlot(track, slot).position) < spawnClearance }) {
        slot += 1
    }
    let pose = gridSlot(track, slot)
    let car = CarState(id: id, position: pose.position, heading: pose.direction.heading)
    let cars = sortById(others.cars + [car])
    let laps = cars.map { c in
        c.id == id
            ? LapState(carId: id, distance: locateOnTrack(track, pose.position).distance)
            : others.lap(c.id)!
    }
    var next = others
    next.cars = cars
    next.laps = laps
    return next
}

/// Every car as new: their damage gone (when a race's damage is switched off).
public func repairCars(_ state: GameState) -> GameState {
    guard state.cars.contains(where: { $0.damage != nil }) else { return state }
    var next = state
    next.cars = state.cars.map { car in
        var repaired = car
        repaired.damage = nil
        return repaired
    }
    return next
}

/// Takes car `id` out of the race (no-op if it isn't there).
public func removeCar(_ state: GameState, _ id: CarId) -> GameState {
    var next = state
    next.cars = state.cars.filter { $0.id != id }
    next.laps = state.laps.filter { $0.carId != id }
    return next
}

/// Puts a car back on the centreline at its nearest point, facing the driving direction, at rest.
/// Its damage stays: only the pits repair a car.
private func resetOnTrack(_ car: CarState, _ track: Track) -> CarState {
    let location = locateOnTrack(track, car.position)
    var reset = CarState(id: car.id, position: location.point, heading: location.tangent.heading)
    reset.damage = car.damage
    reset.tyres = car.tyres
    return reset
}

/// Ids compared as JavaScript compares strings (UTF-16 code units), so the order matches the web.
func sortById(_ cars: [CarState]) -> [CarState] {
    cars.sorted { $0.id.utf16.lexicographicallyPrecedes($1.id.utf16) }
}
