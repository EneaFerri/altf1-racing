/// Track data and the compiled track (`track/types.ts`, 01_docs/track.md).

public enum TrackSide: String, Codable, Sendable {
    case left, right
}

public enum KerbKind: String, Codable, Sendable {
    case none, low, high
}

/// What lies between the asphalt and the wall: a run-off area is paved (`runoffAreas`).
public enum RunoffKind: String, Codable, Sendable {
    case grass, gravel, asphalt
}

/// What a wheel can be on. Effects per surface live in `SurfaceTable`.
public enum Surface: String, Codable, CaseIterable, Sendable {
    case asphalt, kerb, highKerb, grass, gravel
}

/// A spline control point with the asphalt width there; width is blended smoothly between points.
public struct TrackPoint: Codable, Hashable, Sendable {
    public var at: Vec2
    /// Full asphalt width (m).
    public var width: Double
    /// Height of the road here (m); nil on flat tracks (all but Monaco and São Paulo).
    public var height: Double?

    public init(at: Vec2, width: Double, height: Double? = nil) {
        self.at = at
        self.width = width
        self.height = height
    }
}

/// A range of control points.
public struct PointRange: Codable, Hashable, Sendable {
    public var fromPoint: Int
    public var toPoint: Int
}

/// An alternative road between two control points of the main loop (e.g. a shortcut).
public struct TrackBranch: Codable, Hashable, Sendable {
    public var fromPoint: Int
    public var toPoint: Int
    public var points: [TrackPoint]
}

/// A real circuit's pit lane (Phase 4, Grand Prix only; 01_docs/pitlane.md). Positions along it
/// are metres along its centreline from `fromPoint` through `points`.
public struct PitLaneDefinition: Codable, Hashable, Sendable {
    public struct Limit: Codable, Hashable, Sendable {
        public var from: Double
        public var to: Double
    }

    /// The side of the track it lies on.
    public var side: TrackSide
    /// Main-loop control points it leaves after and rejoins before.
    public var fromPoint: Int
    public var toPoint: Int
    /// Its centreline between them, in driving order.
    public var points: [TrackPoint]
    /// The speed-limited stretch (m along the lane).
    public var limit: Limit
    /// Speed limit there (m/s).
    public var speedLimit: Double
    /// Each player's box, in order (m along the lane).
    public var boxes: [Double]
}

public enum KerbPlacement: String, Codable, Sendable {
    case corners, everywhere
}

public struct KerbBand: Codable, Hashable, Sendable {
    public var inset: Double
    public var outset: Double
}

/// Authored (here: generated) track data, compiled into a `Track` by `buildTrack`.
public struct TrackDefinition: Codable, Hashable, Sendable {
    public var name: String
    /// Control points of a closed spline, in driving order.
    public var points: [TrackPoint]
    /// Distance from the asphalt edge to the wall (m).
    public var runoffWidth: Double
    /// Low kerbs only in corners (default), or along both edges of the whole track.
    public var kerbs: KerbPlacement?
    /// Ranges of control points whose corners get high kerbs on the inside.
    public var highKerbs: [PointRange]
    /// Alternative roads.
    public var branches: [TrackBranch]?
    /// Narrowest allowed asphalt (m); nil: `TrackRules.minWidth`.
    public var minWidth: Double?
    /// Control points where each timing sector but the last ends; nil: equal sectors.
    public var sectorPoints: [Int]?
    /// Where a kerb counts across the edge; nil: `TrackRules.kerbInset`/`kerbOutset`.
    public var kerbBand: KerbBand?
    /// Real circuits: the pit lane.
    public var pitLane: PitLaneDefinition?
    /// Run-off wider than `runoffWidth` on one side: an escape area outside a corner (Baku's turn 16).
    public var runoffAreas: [RunoffArea]?
}

/// `width` m more run-off on `side` from control point `fromPoint` to `toPoint`, eased in and out
/// over `TrackRules.runoffAreaRamp` at its ends.
public struct RunoffArea: Codable, Hashable, Sendable {
    public var fromPoint: Int
    public var toPoint: Int
    public var side: TrackSide
    public var width: Double
}

public struct TrackSample: Codable, Hashable, Sendable {
    public var position: Vec2
    /// Unit vector in the driving direction.
    public var tangent: Vec2
    /// Unit vector to the right of the driving direction.
    public var normal: Vec2
    /// Distance from the start line along the centreline (m).
    public var distance: Double
    /// Signed curvature (1/radius): positive = turning right.
    public var curvature: Double
    /// Half of the asphalt width here (m).
    public var halfWidth: Double
    /// Height of the road (m; 0 on a flat track).
    public var height: Double
    /// Slope along the driving direction (rise / run: + = uphill; 0 on a flat track).
    public var grade: Double
}

/// What lies on one side of the track, per sample.
public struct TrackSideInfo: Sendable {
    public var kerb: [KerbKind]
    public var runoff: [RunoffKind]
    /// Run-off beyond `Track.runoffWidth` per sample (m): only with `runoffAreas`. See `runoffAt`.
    public var extraRunoff: [Double]? = nil
}

/// Both sides of the track.
public struct TrackSides: Sendable {
    public var left: TrackSideInfo
    public var right: TrackSideInfo

    public subscript(side: TrackSide) -> TrackSideInfo {
        side == .left ? left : right
    }
}

/// A one-sided wall: collisions push only towards `normal` (which points at the track).
public struct WallSegment: Sendable {
    public var a: Vec2
    public var b: Vec2
    public var normal: Vec2
    /// The road it belongs to: −1 = main loop, else the index in `Track.routes`.
    public var route: Int
    /// Index of that road's sample the segment runs beside.
    public var sample: Int
    /// Main-loop progress (m from the start line) at that sample.
    public var progress: Double

    public init(a: Vec2, b: Vec2, normal: Vec2, route: Int = -1, sample: Int = 0, progress: Double = 0) {
        self.a = a
        self.b = b
        self.normal = normal
        self.route = route
        self.sample = sample
        self.progress = progress
    }
}

/// Where a route's branch runs: its own distances, and the main-loop distances it replaces.
public struct BranchSpan: Sendable {
    public var from: Double
    public var to: Double
    public var mainFrom: Double
    public var mainTo: Double
    /// Main-loop progress at the route's own distance 0.
    public var start: Double
    /// The main loop's length, to wrap progress over the line.
    public var mainLength: Double
}

/// The pit lane's rules on its route, in that route's own distances (m).
public struct PitLaneRules: Sendable {
    public var limitFrom: Double
    public var limitTo: Double
    /// Speed limit there (m/s).
    public var speedLimit: Double
    /// Each box, in order.
    public var boxes: [Double]
    /// The garages' side of the lane: 1 = right of its driving direction, −1 = left.
    public var garageSide: Double
}

/// The part of a track the wall solver needs (tests build a few walls by hand).
public protocol WallSet {
    var walls: [WallSegment] { get }
    var wallGrid: SegmentGrid { get }
}

/// Compiled, immutable track used by both model and view. Static: never part of `GameState`.
public struct Track: WallSet, Sendable {
    public var name: String
    /// Widest half-width anywhere on the track (m), for search radii.
    public var maxHalfWidth: Double
    /// True when its points have heights: only then does the slope act.
    public var elevated: Bool
    /// Run-off all round (m); wider on one side in a run-off area (`runoffAt`).
    public var runoffWidth: Double
    /// Widest run-off anywhere (m), for search radii: only with `runoffAreas`.
    public var maxRunoffWidth: Double? = nil
    /// Kerb band across the edge (m).
    public var kerbInset: Double
    public var kerbOutset: Double
    public var length: Double
    /// Main-loop progress where each timing sector starts; the first is 0.
    public var sectorStarts: [Double]
    /// Closed loop: segment i goes from sample i to sample (i + 1) % n. Sample 0 is the start line.
    public var samples: [TrackSample]
    public var sides: TrackSides
    /// All walls the cars hit.
    public var walls: [WallSegment]
    public var centerGrid: SegmentGrid
    public var wallGrid: SegmentGrid
    /// One complete loop per branch (and the pit lane's, last).
    public var routes: [Track]
    /// On a route: where its branch runs.
    public var branch: BranchSpan?
    /// On a route: true for the pit lane's.
    public var pit: Bool = false
    /// On the pit lane's route: its speed limit and boxes.
    public var pitRules: PitLaneRules?
}
