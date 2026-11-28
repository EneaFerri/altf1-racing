import Foundation

/// The safety car's id (`sim/car.ts`): a car like the others in the state, driven by the race
/// rules, never damaged.
public let safetyCarId: CarId = "safety-car"

/// A safety car period (`race/safetyCar.ts`, R.3, 01_docs/safetycar.md): called (everyone under the
/// delta while it waits for the leader), out ahead of the leader for a lap (no delta), going in, then the restart (no overtaking until the
/// line). Run by the server; the Mac follows it online.
public enum SafetyCarPhase: String, Codable, Sendable {
    case deployed, out, `in`, restart
}

public struct SafetyCarInfo: Codable, Hashable, Sendable {
    public var phase: SafetyCarPhase
    /// Tick it was called.
    public var since: Int
    /// Its last lap: lights out, "SAFETY CAR IN THIS LAP".
    public var inThisLap: Bool
    /// At the restart, the cars past the control line: free to overtake again.
    public var released: [CarId]

    public init(phase: SafetyCarPhase, since: Int, inThisLap: Bool, released: [CarId]) {
        self.phase = phase
        self.since = since
        self.inThisLap = inThisLap
        self.released = released
    }
}

/// An overtake under the safety car: `attacker` must let `victim` by again before tick `until`.
public struct GiveBack: Codable, Hashable, Sendable {
    public var attacker: CarId
    public var victim: CarId
    public var until: Int
}

/// A time penalty given in the race: an overtake not given back, or the delta beaten.
public struct RaceIncident: Codable, Hashable, Sendable {
    public enum Reason: String, Codable, Sendable { case overtake, delta }
    public var tick: Int
    public var id: CarId
    public var reason: Reason
}

/// How the safety car drives, and the delta's speed at each main-loop sample (m/s).
public struct SafetyCarPlans: Sendable {
    public let race: BotPlan
    public let pit: BotPlan?
    public let delta: [Double]
}

/// Plans built once per track and weather (`safetyCarPlans`), shared by every caller.
private final class PlansCache: @unchecked Sendable {
    private let lock = NSLock()
    private var plans: [String: SafetyCarPlans] = [:]

    func get(_ key: String, _ make: () -> SafetyCarPlans) -> SafetyCarPlans {
        lock.lock()
        defer { lock.unlock() }
        if let made = plans[key] { return made }
        let made = make()
        plans[key] = made
        return made
    }
}

private let plansCache = PlansCache()

/// The safety car's plans and the delta on `track` (built with its pit lane; `wet` on a wet track),
/// From this wetness on, the safety car drives (and the delta is reckoned) as on a wet track.
private let safetyCarWetFrom = 0.5

/// The wet params the safety car runs with on a track `wetness` wet (`safetyCarWet`, 2.8): the
/// rain's from 0.5 on, else none (dry). The server and every prediction pick the same.
public func safetyCarWet(_ wetness: Double) -> WetParams? {
    wetness >= safetyCarWetFrom ? .baseline : nil
}

/// from a Medium bot's racing line, as the web builds them.
public func safetyCarPlans(_ track: Track, wet: WetParams? = nil, _ p: SafetyCarParams = .baseline)
    -> SafetyCarPlans
{
    let key = "\(track.name)|\(track.samples.count)|\(track.routes.count)|\(wet == nil ? "dry" : "wet")"
    return plansCache.get(key) {
        let level = BotParams.baseline(.medium)  // never a shortcut
        let base = buildBotPlan(track, .baseline, level, wet: wet)
        func slow(_ plan: BotPlan) -> BotPlan {
            BotPlan(
                road: plan.road, lateral: plan.lateral, line: plan.line,
                speed: plan.speed.map { min($0 * p.pace, p.maxSpeed) })
        }
        let hasPit = track.routes.contains(where: \.pit)
        return SafetyCarPlans(
            race: slow(base),
            pit: hasPit ? slow(buildPitPlan(track, .baseline, level, box: 0, pit: .baseline, wet: wet)) : nil,
            delta: base.speed.map { $0 * p.deltaPace })
    }
}

/// `inputs` with the safety car's own when it is on the track: its racing line at its pace (out of
/// the pit lane on the lane's own road), into the pit lane once `in`; it ignores the traffic. The server drives it alike.
public func withSafetyCar(
    _ inputs: InputMap, _ state: GameState, _ sc: SafetyCarInfo?, _ track: Track, wet: WetParams? = nil
) -> InputMap {
    guard let sc, let car = state.car(safetyCarId) else { return inputs }
    var next = inputs
    if sc.phase == .deployed {
        // Called: waiting at the pit exit for the leader, held on the brakes.
        var held = InputCommand.neutral
        held.brake = 1
        next[safetyCarId] = held
        return next
    }
    let plans = safetyCarPlans(track, wet: wet)
    // Going in, or still in the pit lane coming out of it: the pit lane's own road. The race plan's
    // samples are the main loop's: driven from the lane it aimed at the wrong samples (fixed
    // 2026-11-24: it turned round at the pit exit and drove back into the lane).
    let inLane = sc.phase == .in || pitLanePlace(track, car.position) != nil
    let plan = inLane ? (plans.pit ?? plans.race) : plans.race
    next[safetyCarId] = botInput(car, plan, .new).input
    return next
}

/// Each car's delta (s, + = slower than the reference: fine) while the safety car waits for the
/// leader (`deployed`; none once it has left with it), as the server counts it (`SafetyCarDelta`):
/// from `deltaStart`, the time taken over each stretch less the time the delta's speed allows there;
/// not in the pit lane. Beating it starts `deltaGrace` seconds to get back above it. The HUD's.
public final class SafetyCarDelta {
    private var deltas: [CarId: Double] = [:]
    private var last: [CarId: Double] = [:]
    /// Each car beating its delta: the tick it went under.
    private var underSince: [CarId: Int] = [:]
    private var since: Int?
    private let p: SafetyCarParams

    public init(_ p: SafetyCarParams = .baseline) { self.p = p }

    /// After `ticks` ticks reaching `state` under `sc` (cleared when there is no delta).
    public func update(_ state: GameState, _ sc: SafetyCarInfo?, _ track: Track, _ plans: SafetyCarPlans, ticks: Int = 1) {
        guard let sc, sc.phase == .deployed else {
            clear()
            return
        }
        if since != sc.since {
            clear()
            since = sc.since
        }
        for car in state.cars where car.id != safetyCarId {
            let main = locateOnLoop(track, car.position)
            let inPit = pitLanePlace(track, car.position) != nil
            step(
                car.id, progress: main.distance, index: main.index, inPit: inPit, track, plans, tick: state.tick,
                ticks: ticks)
        }
    }

    private func step(
        _ id: CarId, progress: Double, index: Int, inPit: Bool, _ track: Track, _ plans: SafetyCarPlans, tick: Int,
        ticks: Int
    ) {
        let before = last[id]
        last[id] = progress
        var delta = deltas[id] ?? p.deltaStart
        if let before, !inPit {
            let lap = track.length
            let moved = ((progress - before).truncatingRemainder(dividingBy: lap) + lap).truncatingRemainder(dividingBy: lap)
            // A teleport (a reset) or rolling back: not driving.
            if moved <= 100 * Double(ticks) {
                let allowed = index < plans.delta.count ? plans.delta[index] : .infinity
                delta += Double(ticks) * fixedDt - moved / allowed
            }
        }
        deltas[id] = delta
        if delta >= -p.deltaTolerance {
            underSince[id] = nil
        } else if underSince[id] == nil {
            underSince[id] = tick
        }
    }

    /// `id`'s delta now (s); nil without one.
    public func get(_ id: CarId) -> Double? { since == nil ? nil : deltas[id] }

    /// Beating its delta at `tick`: the seconds `id` has left to get back above it (≤ 0: the penalty is
    /// due); nil when it is not beating it.
    public func graceLeft(_ id: CarId, tick: Int) -> Double? {
        guard since != nil, let under = underSince[id] else { return nil }
        return p.deltaGrace - Double(tick - under) / Double(tickRate)
    }

    public func clear() {
        deltas = [:]
        last = [:]
        underSince = [:]
        since = nil
    }
}
