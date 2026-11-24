/// How a surface affects a car, averaged over the four wheels (`config/surfaces.ts`, 01_docs/track.md).
public struct SurfaceParams: Codable, Hashable, Sendable {
    /// Multiplies lateral grip.
    public var grip: Double
    /// Multiplies engine thrust and braking.
    public var traction: Double
    /// Extra deceleration (m/s²).
    public var drag: Double
    /// Yaw kick (rad/s, at 30 m/s) when a wheel climbs onto this surface; 0 = smooth.
    public var bumpSpin: Double
}

/// One `SurfaceParams` per surface (the web's `Record<Surface, SurfaceParams>`).
public struct SurfaceTable: Codable, Hashable, Sendable {
    public var asphalt: SurfaceParams
    public var kerb: SurfaceParams
    public var highKerb: SurfaceParams
    public var grass: SurfaceParams
    public var gravel: SurfaceParams

    public subscript(surface: Surface) -> SurfaceParams {
        get {
            switch surface {
            case .asphalt: asphalt
            case .kerb: kerb
            case .highKerb: highKerb
            case .grass: grass
            case .gravel: gravel
            }
        }
        set {
            switch surface {
            case .asphalt: asphalt = newValue
            case .kerb: kerb = newValue
            case .highKerb: highKerb = newValue
            case .grass: grass = newValue
            case .gravel: gravel = newValue
            }
        }
    }

    /// The web's `SURFACE_PARAMS`.
    public static let baseline = SurfaceTable(
        asphalt: SurfaceParams(grip: 1, traction: 1, drag: 0, bumpSpin: 0),
        kerb: SurfaceParams(grip: 0.85, traction: 0.95, drag: 0.5, bumpSpin: 0),
        highKerb: SurfaceParams(grip: 0.45, traction: 0.7, drag: 4, bumpSpin: 0.9),
        grass: SurfaceParams(grip: 0.5, traction: 0.6, drag: 5, bumpSpin: 0),
        gravel: SurfaceParams(grip: 0.35, traction: 0.4, drag: 14, bumpSpin: 0))
}
