/// Rules used when compiling a `TrackDefinition` (`config/track.ts`, 01_docs/track.md).
public enum TrackRules {
    /// Narrowest allowed asphalt (m).
    public static let minWidth: Double = 24
    /// Narrowest allowed asphalt on a branch (m).
    public static let minShortcutWidth: Double = 14
    /// Distance between centreline samples (m).
    public static let sampleSpacing: Double = 2
    /// Corners tighter than this curvature (1/radius) get low kerbs on both sides.
    public static let kerbMinCurvature: Double = 1.0 / 110
    /// Kerbs are extended this far before and after the corner (m).
    public static let kerbExtension: Double = 8
    /// Corners tighter than this get a gravel trap on the outside instead of grass.
    public static let gravelMinCurvature: Double = 1.0 / 45
    /// Gravel starts this far before the corner and runs this far after it (m).
    public static let gravelBefore: Double = 6
    public static let gravelAfter: Double = 36
    /// Kerb band: from `inset` inside the track edge to `outset` outside it (m).
    public static let kerbInset: Double = 0.6
    public static let kerbOutset: Double = 1.0
    /// High kerbs are placed on samples curving more than this (1/m).
    public static let highKerbMinCurvature: Double = 1.0 / 300
    /// A run-off area (`TrackDefinition.runoffAreas`) widens and narrows over this much at its ends (m).
    public static let runoffAreaRamp: Double = 20
    /// Timing sectors per lap; they double as checkpoints.
    public static let sectorCount = 3
}
