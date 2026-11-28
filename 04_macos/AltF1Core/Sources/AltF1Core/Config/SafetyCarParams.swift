/// The safety car (`config/safetyCar.ts`, R.3, 01_docs/safetycar.md): multiplayer's Grand Prix
/// only, run by the server; the Mac drives its car in the prediction and shows the delta.
public struct SafetyCarParams: Codable, Hashable, Sendable {
    public var minRaceLaps: Int
    public var impactStrength: Double
    /// Its pace: this share of the racing line's speed, never above `maxSpeed` (m/s).
    public var pace: Double
    public var maxSpeed: Double
    /// The delta's reference: this share of the racing line's speed.
    public var deltaPace: Double
    /// Every car starts this far ahead of its delta (s); under it by `deltaTolerance` it is beating
    /// it, and for `deltaGrace` seconds: a penalty.
    public var deltaStart: Double
    public var deltaTolerance: Double
    public var deltaGrace: Double
    /// A time penalty (s), and the time an overtake must be given back in (s).
    public var penalty: Double
    public var giveBackTime: Double

    public static let baseline = SafetyCarParams(
        minRaceLaps: 10, impactStrength: 28, pace: 0.75, maxSpeed: 55.6, deltaPace: 0.6, deltaStart: 1,
        deltaTolerance: 0.5, deltaGrace: 5, penalty: 5, giveBackTime: 10)
}
