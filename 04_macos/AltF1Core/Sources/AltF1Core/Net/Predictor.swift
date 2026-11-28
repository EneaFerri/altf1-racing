import Foundation

/// Client-side prediction of a whole online room (the web's `multiplayer/Predictor.ts`, the same
/// numbers). Every client tick moves the world one tick on: this player's car with its own input
/// (so it responds at once), the other cars with the last input the server saw from them. Every
/// snapshot restarts from the server's state and replays the inputs the server hasn't run yet; the
/// jump this causes on screen fades out (`decay`) unless it is big (for the other cars: big for
/// their speed). Pure: no network, no clock. See 01_docs/multiplayer.md#prediction-22.
public final class Predictor {
    /// Inputs kept for replay at most (2 s).
    static let maxPending = 120
    /// A correction bigger than this (m) is shown at once instead of faded out (crash, reset).
    public static let snapDistance = 4.0
    /// Another car's correction is shown at once only past what it covers in this long (s).
    public static let remoteSnapSeconds = 0.35
    /// How quickly the own car's correction fades out (1/s), and the other cars' (1/s).
    static let correctionRate = 10.0
    static let remoteCorrectionRate = 6.0
    /// Below this (m, rad) a correction is gone.
    static let negligible = 1e-3

    private struct Offset {
        var position: Vec2
        var heading: Double
    }

    private let playerId: CarId
    private let track: Track
    /// Predicted state now, and one tick before; nil before the first snapshot.
    private var world: GameState?
    private var previous: GameState?
    /// This player's inputs the server hasn't run yet, oldest first.
    private var pending: [(seq: Int, input: InputCommand)] = []
    /// The other cars' last inputs (from the newest snapshot), without reset.
    private var remoteInputs: InputMap = [:]
    private var offsets: [CarId: Offset] = [:]
    /// How far the last snapshot moved this player's car from where it was predicted (m).
    public private(set) var lastCorrection = 0.0
    /// The room's start hold (Grand Prix), applied like the server does; nil = none.
    public var hold: StartHold?
    /// The race's safety car period (online Grand Prix): its car driven like the server drives it.
    public var safetyCar: SafetyCarInfo?

    private var damage = false
    private var boxes: [CarId: Int] = [:]
    private var forecast = dryForecast
    /// What the prediction runs: the room's rules (`onlineSimContext`), as the server has them.
    private var sim: SimContext

    public init(playerId: CarId, track: Track) {
        self.playerId = playerId
        self.track = track
        sim = onlineSimContext(track)
    }

    /// Damage on or off, as the server's room has it (`damageInPhase`).
    public func setDamage(_ on: Bool) {
        guard on != damage else { return }
        damage = on
        rebuild()
    }

    /// Each driver's pit box, as the server's room has them.
    public func setPitBoxes(_ boxes: [CarId: Int]) {
        guard boxes != self.boxes else { return }
        self.boxes = boxes
        rebuild()
    }

    /// The weather the server's room runs: its forecast (as wet as the server's, when).
    public func setWeather(_ forecast: Forecast) {
        guard forecast != self.forecast else { return }
        self.forecast = forecast
        rebuild()
    }

    private func rebuild() {
        sim = onlineSimContext(track, damage: damage, pitBoxes: boxes, forecast: forecast)
    }

    /// One client tick: input number `seq` (also sent to the server) moves the predicted world.
    public func step(_ seq: Int, _ input: InputCommand) {
        pending.append((seq, input))
        if pending.count > Self.maxPending { pending.removeFirst() }
        guard let world else { return }
        previous = world
        self.world = stepGame(world, inputs(input, world), sim)
    }

    /// Restarts from the server's snapshot and replays this player's inputs it hasn't run yet.
    public func reconcile(state: GameState, acks: [CarId: Int], inputs serverInputs: [CarId: InputCommand]) {
        let ack = acks[playerId] ?? -1
        pending.removeAll { $0.seq <= ack }
        remoteInputs = [:]
        for (id, input) in serverInputs where id != playerId {
            var remote = input
            remote.reset = false
            remoteInputs[id] = remote
        }
        var before = state
        var next = state
        for (_, input) in pending {
            before = next
            next = stepGame(next, inputs(input, next), sim)
        }
        keepOnScreen(next)
        previous = before
        world = next
    }

    /// Fades the corrections out by `seconds` of real time (once per frame).
    public func decay(_ seconds: Double) {
        let keepOwn = exp(-Self.correctionRate * seconds)
        let keepOther = exp(-Self.remoteCorrectionRate * seconds)
        for (id, offset) in offsets {
            let keep = id == playerId ? keepOwn : keepOther
            let next = Offset(position: offset.position * keep, heading: offset.heading * keep)
            if next.position.length < Self.negligible && abs(next.heading) < Self.negligible {
                offsets[id] = nil
            } else {
                offsets[id] = next
            }
        }
    }

    /// The predicted world as it should be drawn (corrections still fading); nil before the first snapshot.
    public var current: GameState? { world.map(shown) }

    /// The drawn world one tick before `current`, for interpolation.
    public var before: GameState? { (previous ?? world).map(shown) }

    /// Ticks predicted ahead of the newest snapshot (this player's inputs the server hasn't run).
    public var ahead: Int { pending.count }

    /// Every car's input for the step from `tick`, all neutral while the start hold lasts.
    /// Every car's input for the step from `world`: all neutral while the start hold lasts; the
    /// safety car's as the server drives it.
    private func inputs(_ own: InputCommand, _ world: GameState) -> InputMap {
        var all = remoteInputs
        all[playerId] = own
        let held = heldInputs(all, world.tick, hold)
        return withSafetyCar(held, world, safetyCar, track, wet: safetyCarWet(trackWetness(sim.weather, world.tick)))
    }

    /// Turns the jump from the old prediction to `next` into offsets, so every car stays where it
    /// was drawn and then glides to its corrected place; a big jump is shown at once.
    private func keepOnScreen(_ next: GameState) {
        guard let world else { return }
        for car in next.cars {
            guard let old = world.car(car.id) else { continue }
            if car.id == playerId { lastCorrection = old.position.distance(to: car.position) }
            let offset = offsets[car.id]
            let drawn = offset.map { old.position + $0.position } ?? old.position
            let position = drawn - car.position
            if position.length > snapDistance(car.id, car.velocity.length) {
                offsets[car.id] = nil
                continue
            }
            let heading = wrapAngle(old.heading + (offset?.heading ?? 0) - car.heading)
            offsets[car.id] = Offset(position: position, heading: heading)
        }
    }

    /// How big a correction of `id`'s car going at `speed` (m/s) is shown at once (m).
    private func snapDistance(_ id: CarId, _ speed: Double) -> Double {
        id == playerId ? Self.snapDistance : max(Self.snapDistance, speed * Self.remoteSnapSeconds)
    }

    private func shown(_ state: GameState) -> GameState {
        if offsets.isEmpty { return state }
        var drawn = state
        drawn.cars = state.cars.map { car in
            guard let offset = offsets[car.id] else { return car }
            var moved = car
            moved.position = car.position + offset.position
            moved.heading = car.heading + offset.heading
            return moved
        }
        return drawn
    }
}
