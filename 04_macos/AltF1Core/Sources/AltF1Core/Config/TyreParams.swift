/// Tyre compounds (`config/tyres.ts`, 01_docs/tyres.md; the Grand Prix only).
public enum TyreCompound: String, Codable, CaseIterable, Sendable {
    case soft, medium
}

/// How the compounds drive and wear (`TYRE_PARAMS`).
public struct TyreParams: Codable, Hashable, Sendable {
    /// Multiplier of grip (`lateralGrip`) and turning (`maxYawRate`) on new tyres.
    public var grip: [TyreCompound: Double]
    /// Multiplier of acceleration (`engineAccel`) on new tyres.
    public var traction: [TyreCompound: Double]
    /// Laps (of the circuit's length) from new to fully worn.
    public var lifeLaps: [TyreCompound: Double]
    /// Share of grip, turning and traction a fully worn set has lost.
    public var wornLoss: Double

    public static let baseline = TyreParams(
        grip: [.soft: 1.05, .medium: 1], traction: [.soft: 1.05, .medium: 1], lifeLaps: [.soft: 4, .medium: 9],
        wornLoss: 0.1)
}
