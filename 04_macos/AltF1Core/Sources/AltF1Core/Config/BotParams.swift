/// Bot driving levels (`config/bot.ts`, 01_docs/bot.md).
public enum BotLevel: String, Codable, CaseIterable, Sendable {
    case easy, medium, hard

    /// The B key's cycle: Off → Easy → Medium → Hard → Off.
    public static func next(after level: BotLevel?) -> BotLevel? {
        guard let level else { return .easy }
        let all = allCases
        let i = all.firstIndex(of: level)!
        return i + 1 < all.count ? all[i + 1] : nil
    }
}

public struct BotParams: Codable, Hashable, Sendable {
    /// Multiplier on the cornering speed the car's yaw rate allows.
    public var cornerSpeed: Double
    /// Fraction of `brakeDecel` the bot plans its braking with.
    public var brakeUse: Double
    /// Fraction of the usable half-width the racing line may use.
    public var lineCut: Double
    /// Fraction of `maxSpeed` allowed anywhere.
    public var topSpeed: Double
    /// Multiplier on the bot car's `engineAccel` and `maxSpeed` vs the player's.
    public var performance: Double
    /// Takes the track's first branch (a shortcut) instead of the main road.
    public var shortcuts: Bool

    public static func baseline(_ level: BotLevel) -> BotParams {
        switch level {
        case .easy:
            BotParams(cornerSpeed: 0.5, brakeUse: 0.55, lineCut: 0.4, topSpeed: 0.75, performance: 1, shortcuts: false)
        case .medium:
            BotParams(cornerSpeed: 1.15, brakeUse: 1, lineCut: 1, topSpeed: 1, performance: 1, shortcuts: false)
        case .hard:
            BotParams(cornerSpeed: 1.15, brakeUse: 1, lineCut: 1, topSpeed: 1, performance: 1.03, shortcuts: true)
        }
    }
}

/// How every bot steers and recovers, whatever its level (`BOT_DRIVER`).
public enum BotDriver {
    static let lookAheadBase: Double = 8
    static let lookAheadTime: Double = 0.5
    static let steerGain: Double = 2.5
    static let speedLookAheadTime: Double = 0.25
    static let edgeMargin: Double = 3
    static let lineSpan: Double = 8
    static let lineIterations = 80
    static let trafficRange: Double = 150
    static let carWidth: Double = 3.5
    static let parkedWidth: Double = 2.6
    static let creepSpeed: Double = 3
    static let followGap: Double = 6
    static let followTime: Double = 0.04
    static let trafficDecel: Double = 22
    static let passLookAhead: Double = 18
    static let passLookAheadTime: Double = 0
    static let passMargin: Double = 0.5
    static let passAbortTime: Double = 1.2
    static let passAbortDrop: Double = 8
    static let yieldDrop: Double = 3
    static let passRate: Double = 4
    static let passEdgeMargin: Double = 2
    static let squeezeEdgeMargin: Double = 1
    static let alongside: Double = 9
    static let stuckSpeed: Double = 2
    static let stuckSeconds: Double = 2
}
