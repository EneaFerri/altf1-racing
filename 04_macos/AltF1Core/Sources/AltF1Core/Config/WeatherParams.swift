/// The weather a race is run in (`config/weather.ts`, 01_docs/weather.md).
public enum Weather: String, Codable, CaseIterable, Sendable {
    case dry, rain

    /// The circuits whose Grand Prix may be run in the rain (2.7: São Paulo first).
    public static let rainTracks: [String] = ["São Paulo"]

    /// Whether the Grand Prix on `track` (its name) may be run in the rain.
    public static func offersRain(_ track: String) -> Bool { rainTracks.contains(track) }
}

/// How a wet track drives: multipliers of the surface's own effect.
public struct WetParams: Codable, Hashable, Sendable {
    /// Multiplies lateral grip on a wet track.
    public var grip: Double
    /// Multiplies engine thrust and braking (wet tyres).
    public var traction: Double
    /// Multiplies braking only, on top of `traction`.
    public var brake: Double
    /// A wheel in a puddle: multiplies grip, then traction, adds drag (m/s², all four wheels in it).
    public var puddleGrip: Double
    public var puddleTraction: Double
    public var puddleDrag: Double

    /// The owner's values (F2, 2026-11-18).
    public static let baseline = WetParams(
        grip: 0.3, traction: 0.95, brake: 0.59, puddleGrip: 0.1, puddleTraction: 0.3,
        puddleDrag: 2.3)
}

/// Where the puddles of a wet track lie (`placePuddles`).
public struct PuddleParams: Codable, Hashable, Sendable {
    /// One candidate spot every this many metres along the track.
    public var step: Double
    /// Chance of a puddle at a candidate spot on a straight.
    public var baseChance: Double
    /// Extra chance per unit of curvature (1/m) nearby.
    public var bendChance: Double
    /// Highest chance at a spot.
    public var maxChance: Double
    /// How far before and after a spot its corner is looked for (m).
    public var bendWindow: Double
    /// Half the puddle's length along the track (m): smallest and largest.
    public var halfLength: [Double]
    /// Half the puddle's width across the track (m): smallest and largest.
    public var halfWidth: [Double]
    /// Space kept between a puddle and the kerb band (m).
    public var edgeClearance: Double
    /// No puddle within this many metres before the start line (the grid).
    public var gridBack: Double
    /// No puddle within this many metres after the start line.
    public var gridAhead: Double

    public static let baseline = PuddleParams(
        step: 40, baseChance: 0.1, bendChance: 25, maxChance: 0.6, bendWindow: 50,
        halfLength: [1.5, 3.5], halfWidth: [0.8, 1.8], edgeClearance: 0.6, gridBack: 190,
        gridAhead: 30)
}
