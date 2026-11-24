/// Car damage (`config/damage.ts`, 01_docs/damage.md; Grand Prix only).
public struct DamageParams: Codable, Hashable, Sendable {
    /// Hits slower than this (m/s of closing speed) do no damage.
    public var impactThreshold: Double
    /// Damage to the part hit per m/s of closing speed above the threshold.
    public var impactDamage: Double
    /// Share of a front (rear) hit's damage that also goes to the two front (rear) tyres.
    public var endTyreShare: Double
    /// Share of a side hit's damage that goes to the two tyres on that side.
    public var sideTyreShare: Double
    /// Contact points further ahead than this (m) are front hits, further behind than `rearZone` rear.
    public var frontZone: Double
    public var rearZone: Double
    /// Tyre damage per second per wheel on grass and on gravel, at `offTrackSpeed` or faster.
    public var grassDamage: Double
    public var gravelDamage: Double
    /// Speed (m/s) from which off-track damage is full.
    public var offTrackSpeed: Double

    /// Shares of top speed, turning and grip a fully damaged part costs.
    public var frontWingSpeedLoss: Double
    public var frontWingTurnLoss: Double
    public var frontWingGripLoss: Double
    public var rearWingSpeedLoss: Double
    public var rearWingTurnLoss: Double
    public var rearWingGripLoss: Double
    public var tyreSpeedLoss: Double
    public var tyreTurnLoss: Double
    public var tyreGripLoss: Double
    /// Steering added towards the more damaged side, per unit of left/right tyre difference.
    public var tyrePull: Double
    /// The least share of top speed, turning and grip a car ever keeps.
    public var minSpeed: Double
    public var minTurn: Double
    public var minGrip: Double

    public static let baseline = DamageParams(
        impactThreshold: 8, impactDamage: 0.018, endTyreShare: 0.5, sideTyreShare: 0.6,
        frontZone: 1, rearZone: 0.7, grassDamage: 0.015, gravelDamage: 0.05, offTrackSpeed: 30,
        frontWingSpeedLoss: 0.04, frontWingTurnLoss: 0.25, frontWingGripLoss: 0,
        rearWingSpeedLoss: 0.04, rearWingTurnLoss: 0, rearWingGripLoss: 0.3,
        tyreSpeedLoss: 0.08, tyreTurnLoss: 0.1, tyreGripLoss: 0.3, tyrePull: 0.12,
        minSpeed: 0.8, minTurn: 0.6, minGrip: 0.5)
}

/// Pit stops (`config/pit.ts`, 01_docs/pitlane.md). The speed limit is the circuit's own.
public struct PitParams: Codable, Hashable, Sendable {
    /// A car this close to its box along the lane (m) and slower than `boxSpeed` (m/s) stops in it.
    public var boxReach: Double
    public var boxSpeed: Double
    /// The box's spot: this share of the lane's half-width from its centre, towards the garages.
    public var boxSide: Double
    /// A stop's time (s): the tyres, every time, plus each wing by its damage.
    public var tyresTime: Double
    public var frontWingTime: Double
    public var rearWingTime: Double

    public static let baseline = PitParams(
        boxReach: 5, boxSpeed: 8, boxSide: 0.5, tyresTime: 2.5, frontWingTime: 6, rearWingTime: 8)
}
