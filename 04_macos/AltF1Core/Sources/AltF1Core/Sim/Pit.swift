/// A car's pit stop (`sim/pit.ts`, 01_docs/pitlane.md): held in its box until tick `until`; from
/// then on it has stopped on this pass through the pits, until it leaves the lane.
public struct PitStop: Codable, Hashable, Sendable {
    public var until: Int
}

/// The pit lane's rules of a race (`SimContext.pit`): its parameters and each car's box.
public struct PitRules: Sendable {
    public var params: PitParams
    /// Box index (into `PitLaneRules.boxes`) per car; a car without one never stops.
    public var boxes: [CarId: Int]

    public init(params: PitParams = .baseline, boxes: [CarId: Int]) {
        self.params = params
        self.boxes = boxes
    }
}

/// Where a point is on the pit lane: its route, rules and own distance along it.
public struct PitLanePlace: Sendable {
    public var road: Track
    public var rules: PitLaneRules
    public var distance: Double
}

public func pitLanePlace(_ track: Track, _ p: Vec2) -> PitLanePlace? {
    guard let route = track.routes.firstIndex(where: \.pit),
        locateOnTrack(track, p).route == route
    else { return nil }
    let road = track.routes[route]
    return PitLanePlace(road: road, rules: road.pitRules!, distance: locateOnLoop(road, p).distance)
}

/// Whether `place` is between the pit lane's limit lines.
public func inLimit(_ place: PitLanePlace?) -> Bool {
    guard let place else { return false }
    return place.distance >= place.rules.limitFrom && place.distance <= place.rules.limitTo
}

/// A stop's length in ticks: the tyres every time, each wing by its damage.
public func stopTicks(_ damage: CarDamage?, _ p: PitParams) -> Int {
    let d = damage ?? .none
    return Int(
        jsRound((p.tyresTime + d.frontWing * p.frontWingTime + d.rearWing * p.rearWingTime) * Double(tickRate)))
}

/// Where a car stands in box `box`: beside the lane's centre, towards the garages, facing along it.
public func boxSpot(_ road: Track, _ box: Int, _ p: PitParams) -> (position: Vec2, heading: Double) {
    let rules = road.pitRules!
    let at = rules.boxes[box % rules.boxes.count]
    let samples = road.samples
    let n = samples.count
    let i = (0..<n).first { k in k + 1 < n && samples[k + 1].distance > at } ?? -1
    let s = samples[max(0, i)]
    let offset = rules.garageSide * p.boxSide * s.halfWidth
    return (s.position + s.normal * offset, s.tangent.heading)
}

/// `car` held still in its box: it doesn't move and its controls do nothing.
public func heldInBox(_ car: CarState, compound: TyreCompound? = nil) -> CarState {
    var next = car
    if let compound { next.tyres = TyreState(compound: compound) }
    next.velocity = .zero
    next.yawRate = 0
    next.spin = 0
    next.steer = 0
    next.brakePressure = 0
    return next
}

/// Whether `car` is stopped in its box at the step from `tick`.
public func inBox(_ car: CarState, _ tick: Int) -> Bool {
    guard let stop = car.pitStop else { return false }
    return tick < stop.until
}

/// `car` after moving: no faster than the limit between the limit lines (the automatic limiter).
public func limitedSpeed(_ car: CarState, _ track: Track) -> CarState {
    let place = pitLanePlace(track, car.position)
    guard inLimit(place), let place else { return car }
    let speed = car.velocity.length
    let limit = place.rules.speedLimit
    guard speed > limit else { return car }
    var next = car
    next.velocity = car.velocity * (limit / speed)
    return next
}

/// `car`'s pit stop at the end of the step to `tick`: released (repaired) when its stop ends; its
/// stop forgotten once it has left the lane; else, slow enough at its own box, stopped there for
/// `stopTicks`, unless another of `cars` is still stopped in that box.
public func pitStep(_ car: CarState, _ track: Track, _ tick: Int, _ pit: PitRules, _ cars: [CarState] = [])
    -> CarState
{
    if let stop = car.pitStop {
        if tick == stop.until {
            var next = car
            if car.damage != nil { next.damage = CarDamage.none }
            return next
        }
        if tick > stop.until && pitLanePlace(track, car.position) == nil {
            var next = car
            next.pitStop = nil
            return next
        }
        return car
    }
    guard let box = pit.boxes[car.id], car.velocity.length <= pit.params.boxSpeed,
        let place = pitLanePlace(track, car.position)
    else { return car }
    let count = place.rules.boxes.count
    let at = place.rules.boxes[box % count]
    if abs(place.distance - at) > pit.params.boxReach { return car }
    let busy = cars.contains { other in
        guard other.id != car.id, let otherBox = pit.boxes[other.id] else { return false }
        return otherBox % count == box % count && inBox(other, tick)
    }
    if busy { return car }
    let spot = boxSpot(place.road, box, pit.params)
    var next = heldInBox(car)
    // A new set of the same compound (with tyres in the race), until its driver chooses another.
    if let tyres = car.tyres { next.tyres = TyreState(compound: tyres.compound) }
    next.position = spot.position
    next.heading = spot.heading
    next.pitStop = PitStop(until: tick + stopTicks(car.damage, pit.params))
    return next
}

/// What a car's driver sees of the pit lane: the limiter, and a stop's seconds left.
public struct PitStatus: Sendable {
    public var limiter: Bool
    /// Speed limit there (m/s).
    public var speedLimit: Double
    /// Seconds left of the stop in its box; nil when not stopped.
    public var stopLeft: Double?
}

/// `car`'s pit lane status at `tick`; nil off the pit lane.
public func pitStatus(_ track: Track, _ car: CarState, _ tick: Int) -> PitStatus? {
    guard let place = pitLanePlace(track, car.position) else { return nil }
    return PitStatus(
        limiter: inLimit(place),
        speedLimit: place.rules.speedLimit,
        stopLeft: inBox(car, tick) ? Double(car.pitStop!.until - tick) / Double(tickRate) : nil)
}
