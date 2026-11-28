/// Tyre compounds (`config/tyres.ts`, 01_docs/tyres.md; the Grand Prix only): slicks (soft,
/// medium) and the rain tyres (T.2: intermediate, full wet).
public enum TyreCompound: String, Codable, CaseIterable, Sendable {
    case soft, medium, intermediate, wet

    /// Whether it is a dry-weather (slick) tyre (`isSlick`).
    public var isSlick: Bool { self == .soft || self == .medium }
}

/// A value at wetness 0 (dry), 0.5 and 1 (soaked); in between, linearly (`atWetness`).
public typealias WetCurve = [Double]

/// `curve` at `wetness` (0…1) (`atWetness`).
public func atWetness(_ curve: WetCurve, _ wetness: Double) -> Double {
    let (dry, half, soaked) = (curve[0], curve[1], curve[2])
    return wetness <= 0.5
        ? dry + (half - dry) * (wetness / 0.5)
        : half + (soaked - half) * ((wetness - 0.5) / 0.5)
}

/// How a compound copes with a wet track: multipliers of the dry surface's effect (`WetTyre`).
public struct WetTyre: Codable, Hashable, Sendable {
    public var grip: WetCurve
    public var traction: WetCurve
    public var brake: WetCurve
    /// A wheel in a puddle on a soaked track: grip and traction (aquaplaning).
    public var puddleGrip: Double
    public var puddleTraction: Double
    /// Power oversteer (2.8): the cornering load (m/s²) above which the throttle breaks the rear
    /// loose, at wetness 0.5 and 1 (`slideFrom`).
    public var slideFrom: [Double]
}

/// How the compounds drive and wear (`TYRE_PARAMS`).
public struct TyreParams: Codable, Hashable, Sendable {
    /// Multiplier of grip (`lateralGrip`) and turning (`maxYawRate`) on new tyres, on a dry track.
    public var grip: [TyreCompound: Double]
    /// Multiplier of acceleration (`engineAccel`) on new tyres.
    public var traction: [TyreCompound: Double]
    /// Laps (of the circuit's length) from new to fully worn.
    public var lifeLaps: [TyreCompound: Double]
    /// Share of grip, turning and traction a fully worn set has lost.
    public var wornLoss: Double
    /// Each compound on a wet track (T.2).
    public var wet: [TyreCompound: WetTyre]
    /// How much faster a compound wears on a dry track (× at wetness 0, × 1 from `cooledAt`).
    public var dryWear: [TyreCompound: Double]
    public var cooledAt: Double
    /// How fast a car on the throttle past `slideFrom` turns itself round (1/s, of the excess).
    public var slideGain: Double
    /// A slide spins the car round no faster than this (rad/s).
    public var slideMaxSpin: Double
    /// The tyre the weather asks for (`weatherCompound`): intermediates from this wetness…
    public var intermediateFrom: Double
    /// …full wets from this one.
    public var wetFrom: Double

    private static let slickInWet = WetTyre(
        grip: [1, 0.45, 0.22], traction: [1, 0.75, 0.55], brake: [1, 0.6, 0.45], puddleGrip: 0.1,
        puddleTraction: 0.3, slideFrom: [50, 30])

    public static let baseline = TyreParams(
        grip: [.soft: 1.05, .medium: 1, .intermediate: 0.93, .wet: 0.86],
        traction: [.soft: 1.05, .medium: 1, .intermediate: 0.97, .wet: 0.94],
        lifeLaps: [.soft: 4, .medium: 9, .intermediate: 7, .wet: 8],
        wornLoss: 0.1,
        wet: [
            .soft: slickInWet, .medium: slickInWet,
            .intermediate: WetTyre(
                grip: [1, 0.86, 0.66], traction: [1, 0.95, 0.85], brake: [1, 0.9, 0.78], puddleGrip: 0.45,
                puddleTraction: 0.6, slideFrom: [75, 50]),
            .wet: WetTyre(
                grip: [1, 0.92, 0.8], traction: [1, 0.97, 0.92], brake: [1, 0.93, 0.85], puddleGrip: 0.7,
                puddleTraction: 0.8, slideFrom: [80, 60]),
        ],
        dryWear: [.soft: 1, .medium: 1, .intermediate: 3, .wet: 4],
        cooledAt: 0.5, slideGain: 7, slideMaxSpin: 3.5, intermediateFrom: 0.15, wetFrom: 0.6)
}

/// The cornering load (m/s²) above which the throttle breaks `compound`'s rear loose on a track
/// `wetness` wet (`slideFrom`): none when dry, very high when barely damp.
public func slideFrom(_ compound: TyreCompound, _ wetness: Double, _ p: TyreParams) -> Double {
    if wetness <= 0 { return .infinity }
    let curve = p.wet[compound]!.slideFrom
    let (half, soaked) = (curve[0], curve[1])
    return wetness <= 0.5 ? half * (0.5 / wetness) : half + (soaked - half) * ((wetness - 0.5) / 0.5)
}

/// The tyre for a track this wet: mediums when (nearly) dry, then intermediates, then full wets.
public func weatherCompound(_ wetness: Double, _ p: TyreParams = .baseline) -> TyreCompound {
    if wetness >= p.wetFrom { return .wet }
    return wetness >= p.intermediateFrom ? .intermediate : .medium
}
