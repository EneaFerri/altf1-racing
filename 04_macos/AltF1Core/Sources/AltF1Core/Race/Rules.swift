import Foundation

/// The phases of a Grand Prix (`net/protocol.ts`).
public enum GrandPrixPhase: String, Codable, Sendable {
    case lobby, qualifying, grid, race, results
}

/// What a Grand Prix's manager (or, for play again, anyone) asks of it.
public enum GrandPrixCommand: Sendable, Equatable {
    case start
    case weather(Weather)
    case endQualifying
    case startRace(laps: Int)
    case endRace
    case playAgain
}

/// Whether cars take damage in `phase` (`race/damage.ts`): qualifying and the race only.
public func damageInPhase(_ phase: GrandPrixPhase) -> Bool {
    phase == .qualifying || phase == .race
}

/// Cars held on the grid (`race/hold.ts`): every input neutral while the tick is below `until`
/// (lights out). `lightsFrom`: the tick the first red light comes on; nil = held with no start yet.
public struct StartHold: Codable, Hashable, Sendable {
    public var lightsFrom: Int?
    public var until: Int

    /// Held until further notice (the web's `Number.MAX_SAFE_INTEGER`).
    public static let held = StartHold(lightsFrom: nil, until: 9_007_199_254_740_991)
}

/// The inputs for the step from `tick`: none (all neutral) while `hold` holds, else `inputs`.
public func heldInputs(_ inputs: InputMap, _ tick: Int, _ hold: StartHold?) -> InputMap {
    if let hold, tick < hold.until { return [:] }
    return inputs
}

/// The start from `now`: the first light after a second, one more every second, lights out a
/// random 0.2–1 s (`random` in [0, 1)) after the last one came on.
public func startHold(_ now: Int, _ random: Double) -> StartHold {
    let rate = Double(tickRate)
    let interval = Int(jsRound(GrandPrixRules.lightInterval * rate))
    let lightsFrom = now + Int(jsRound(GrandPrixRules.lightDelay * rate))
    let lastOn = lightsFrom + (GrandPrixRules.lightCount - 1) * interval
    let out = GrandPrixRules.lightsOutMin + (GrandPrixRules.lightsOutMax - GrandPrixRules.lightsOutMin) * random
    return StartHold(lightsFrom: lightsFrom, until: lastOn + Int(jsRound(out * rate)))
}

/// Red lights on at `tick` (0 before the first and from lights out on).
public func lightsOn(_ tick: Int, _ hold: StartHold?) -> Int {
    guard let hold, let from = hold.lightsFrom, tick >= from, tick < hold.until else { return 0 }
    let interval = Int(jsRound(GrandPrixRules.lightInterval * Double(tickRate)))
    return min(GrandPrixRules.lightCount, (tick - from) / interval + 1)
}

/// One driver's qualifying so far (`race/qualifying.ts`). Times in ticks.
public struct QualifyingEntry: Codable, Hashable, Sendable {
    public var id: CarId
    /// Fastest valid timed lap; nil = no time yet.
    public var best: Int?
    /// Tick that best lap was set on (it decides a tie).
    public var setAt: Int?
    /// Timed laps completed (valid or not).
    public var laps: Int
    /// All timed laps driven: the car has left the track.
    public var done: Bool
}

/// Qualifying order, which is also the grid: fastest first; a tie to whoever set it first; drivers
/// with no time at the back, in the order given.
public func qualifyingOrder(_ entries: [QualifyingEntry]) -> [QualifyingEntry] {
    // Stable: an explicit index keeps the given order wherever the comparison ties.
    entries.enumerated().sorted { x, y in
        let (a, b) = (x.element, y.element)
        switch (a.best, b.best) {
        case (nil, nil): return x.offset < y.offset
        case (nil, _): return false
        case (_, nil): return true
        case (let p?, let q?):
            if p != q { return p < q }
            if a.setAt! != b.setAt! { return a.setAt! < b.setAt! }
            return x.offset < y.offset
        }
    }.map(\.element)
}
