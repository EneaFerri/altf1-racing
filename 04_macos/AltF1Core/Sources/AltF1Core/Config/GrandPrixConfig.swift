/// One team of the single-player Grand Prix: two drivers, in this order (`config/teams.ts`).
public struct Team: Hashable, Sendable {
    public let id: TeamId
    public let name: String
    public let drivers: [String]
}

public enum TeamId: String, Codable, CaseIterable, Sendable {
    case mercedes, ferrari, redBull, mclaren, polimi
}

public enum Teams {
    /// Strongest first (the owner's order); bot classes go by it, then by driver order.
    public static let all: [Team] = [
        Team(id: .mercedes, name: "Mercedes", drivers: ["Russell", "Antonelli"]),
        Team(id: .ferrari, name: "Ferrari", drivers: ["Leclerc", "Hamilton"]),
        Team(id: .redBull, name: "Red Bull", drivers: ["Verstappen", "Hadjar"]),
        Team(id: .mclaren, name: "McLaren", drivers: ["Norris", "Piastri"]),
        Team(id: .polimi, name: "Polimi", drivers: ["IngConti", "Margara"]),
    ]

    public static func team(_ id: TeamId) -> Team { all.first { $0.id == id }! }

    /// How many of the 9 bots drive at each level: the strongest seats get the Hard ones.
    public static let hardBots = 5
    public static let mediumBots = 4
}

/// Rules of a Grand Prix (`config/grandPrix.ts`, 01_docs/multiplayer.md#grand-prix).
public enum GrandPrixRules {
    /// Timed laps each driver gets in qualifying (Q1, Q2, Q3; the best one counts).
    public static let qualifyingLaps = 3
    /// The race distances offered on keys 1/2/3, in laps.
    public static let raceLaps = [4, 8, 12]
    /// Any other distance (key 4, then ←/→).
    public static let customLapsMin = 1
    public static let customLapsMax = 24
    public static let customLapsStart = 12
    /// Mandatory pit stops: one per `lapsPerStop` laps, at most `maxRequiredStops`, 25 s each missing.
    public static let lapsPerStop = 4
    public static let maxRequiredStops = 4
    public static let penaltySeconds = 25
    /// F1 points for the first ten classified.
    public static let points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
    /// F1 start: the red lights come on one by one, then all go out together.
    public static let lightCount = 5
    public static let lightInterval: Double = 1
    public static let lightDelay: Double = 1
    public static let lightsOutMin: Double = 0.2
    public static let lightsOutMax: Double = 1

    /// Whether `laps` is a race distance the manager may choose.
    public static func isRaceLaps(_ laps: Int) -> Bool { laps >= customLapsMin && laps <= customLapsMax }
}

/// Pit stops a race over `laps` laps requires: one per 4 laps, rounded down, at most 4 (`race/pitRule.ts`).
public func requiredStops(_ laps: Int) -> Int {
    min(GrandPrixRules.maxRequiredStops, max(0, laps) / GrandPrixRules.lapsPerStop)
}

/// The time penalty (ticks) of a driver who made `stops` stops over `laps` completed laps.
public func pitPenaltyTicks(stops: Int, laps: Int) -> Int {
    max(0, requiredStops(laps) - stops) * GrandPrixRules.penaltySeconds * tickRate
}
