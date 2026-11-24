/// Slipstream (`config/slipstream.ts`, 01_docs/physics.md#slipstream).
public struct SlipstreamParams: Codable, Hashable, Sendable {
    /// Wake length behind the leading car, centre to centre (m).
    public var range: Double
    /// Gap (centre to centre, m) at which the tow is full.
    public var fullGap: Double
    /// Half width of the wake (m).
    public var halfWidth: Double
    /// Largest heading difference to the leader that still gets a tow (rad).
    public var maxHeadingDiff: Double
    /// Leader's forward speed (m/s) below which there is no wake at all.
    public var minSpeed: Double
    /// Leader's forward speed (m/s) from which the wake is at full strength.
    public var fullSpeed: Double
    /// Fraction of air drag removed at full tow (0..1).
    public var dragCut: Double
    /// Extra forward push at full tow while on throttle (m/s²).
    public var towAccel: Double

    public static let baseline = SlipstreamParams(
        range: 40, fullGap: 6, halfWidth: 3, maxHeadingDiff: .pi / 4, minSpeed: 25,
        fullSpeed: 60, dragCut: 0.45, towAccel: 1)
}

/// Slopes on an elevated track (`config/slope.ts`, 01_docs/elevation.md).
public struct SlopeParams: Codable, Hashable, Sendable {
    /// Gravity (m/s²).
    public var gravity: Double
    /// Share of the real pull felt (0 = none, 1 = full gravity along the slope).
    public var factor: Double

    public static let baseline = SlopeParams(gravity: 9.81, factor: 0.5)
}
