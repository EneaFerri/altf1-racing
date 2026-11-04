import type { SegmentGrid } from '../math/SegmentGrid';
import type { Vec2 } from '../math/vec2';

export type TrackSide = 'left' | 'right';
export type KerbKind = 'none' | 'low' | 'high';
export type RunoffKind = 'grass' | 'gravel';
/** What a wheel can be on. Effects per surface live in config/surfaces.ts. */
export type Surface = 'asphalt' | 'kerb' | 'highKerb' | 'grass' | 'gravel';

/** A spline control point with the asphalt width there; width is blended smoothly between points. */
export interface TrackPoint {
  readonly at: Vec2;
  /** Full asphalt width (m), at least the track's minimum width (minShortcutWidth on a branch). */
  readonly width: number;
  /**
   * Height of the road here (m). Left out on flat tracks: every track but Monaco v2 (Phase 3,
   * 01_docs/elevation.md). Interpolated smoothly between points.
   */
  readonly height?: number;
}

/**
 * An alternative road between two control points of the main loop (e.g. a shortcut): the cars may
 * take either. `points` lie strictly between `fromPoint` and `toPoint` (fromPoint < toPoint).
 */
export interface TrackBranch {
  readonly fromPoint: number;
  readonly toPoint: number;
  readonly points: readonly TrackPoint[];
}

/**
 * A real circuit's pit lane (Phase 4: drivable in the Grand Prix only; generated from OSM by
 * 01_tools/openf1, see 01_docs/pitlane.md). A road leaving the main loop after `fromPoint` and
 * rejoining it before `toPoint`; it may cross the start line (then `fromPoint` > `toPoint`).
 * Positions along it are metres along its centreline (the polyline from `fromPoint` through
 * `points` to `toPoint`): unambiguous even where it runs across the lap (Monaco's entry).
 */
export interface PitLaneDefinition {
  /** The side of the track it lies on. */
  readonly side: TrackSide;
  /** Main-loop control points it leaves after and rejoins before. */
  readonly fromPoint: number;
  readonly toPoint: number;
  /** Its centreline between them, in driving order; `width` = the lane's. */
  readonly points: readonly TrackPoint[];
  /** The speed-limited stretch, between the pit entry and exit lines (m along the lane). */
  readonly limit: { readonly from: number; readonly to: number };
  /** Speed limit there (m/s). */
  readonly speedLimit: number;
  /** Each player's box, in order (m along the lane, inside `limit`). */
  readonly boxes: readonly number[];
}

/** Hand-authored track data. Compiled into a `Track` by `buildTrack`. See 01_docs/track.md. */
export interface TrackDefinition {
  readonly name: string;
  /** Control points of a closed spline, in driving order. */
  readonly points: readonly TrackPoint[];
  /** Distance from the asphalt edge to the wall (m). */
  readonly runoffWidth: number;
  /** Low kerbs only in corners (default), or along both edges of the whole track. */
  readonly kerbs?: 'corners' | 'everywhere';
  /** Ranges of control points whose corners get high kerbs on the inside. */
  readonly highKerbs: readonly { readonly fromPoint: number; readonly toPoint: number }[];
  /** Alternative roads; see 01_docs/track.md#branches. */
  readonly branches?: readonly TrackBranch[];
  /**
   * Narrowest allowed asphalt (m). Imaginary tracks leave it out (TRACK_RULES.minWidth); real
   * circuits declare their own, since their widths come from real data (see 01_docs/circuits.md).
   */
  readonly minWidth?: number;
  /**
   * Control points where each timing sector but the last ends, in order (TRACK_RULES.sectorCount − 1
   * of them). Left out: sectors of equal length. Real circuits use their real sector positions.
   */
  readonly sectorPoints?: readonly number[];
  /**
   * Where a kerb counts across the edge: from `inset` inside it to `outset` outside it (m).
   * Left out: TRACK_RULES.kerbInset / kerbOutset. Real circuits use wider kerbs.
   */
  readonly kerbBand?: { readonly inset: number; readonly outset: number };
  /** Real circuits: the pit lane (only the Grand Prix drives it; elsewhere it is scenery). */
  readonly pitLane?: PitLaneDefinition;
}

export interface TrackSample {
  readonly position: Vec2;
  /** Unit vector in the driving direction. */
  readonly tangent: Vec2;
  /** Unit vector to the right of the driving direction. */
  readonly normal: Vec2;
  /** Distance from the start line along the centreline (m). */
  readonly distance: number;
  /** Signed curvature (1/radius): positive = turning right. */
  readonly curvature: number;
  /** Half of the asphalt width here (m). */
  readonly halfWidth: number;
  /** Height of the road (m; 0 on a flat track). */
  readonly height: number;
  /** Slope along the driving direction (rise / run: + = uphill; 0 on a flat track). */
  readonly grade: number;
}

/** What lies on one side of the track, per sample. */
export interface TrackSideInfo {
  readonly kerb: readonly KerbKind[];
  readonly runoff: readonly RunoffKind[];
}

/** A one-sided wall: collisions push only towards `normal` (which points at the track). */
export interface WallSegment {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly normal: Vec2;
  /** The road it belongs to: -1 = main loop, else the index in `Track.routes`. */
  readonly route: number;
  /** Index of that road's sample the segment runs beside. */
  readonly sample: number;
  /** Main-loop progress (m from the start line) at that sample, e.g. to style walls by stretch. */
  readonly progress: number;
}

/** Where a route's branch runs: its own distances, and the main-loop distances it replaces. */
export interface BranchSpan {
  readonly from: number;
  readonly to: number;
  readonly mainFrom: number;
  readonly mainTo: number;
  /**
   * Main-loop progress at the route's own distance 0: 0 for a branch (its route starts on the
   * line); the pit lane's route starts where it rejoins, so it can cross the line.
   */
  readonly start: number;
  /** The main loop's length, to wrap progress over the line. */
  readonly mainLength: number;
}

/** Compiled, immutable track used by both Model and View. Static: never part of GameState. */
export interface Track {
  readonly name: string;
  /** Widest half-width anywhere on the track (m), for search radii. */
  readonly maxHalfWidth: number;
  /** True when its points have heights (Monaco v2): only then does the slope act. */
  readonly elevated: boolean;
  readonly runoffWidth: number;
  /** Kerb band across the edge (m): from `kerbInset` inside it to `kerbOutset` outside it. */
  readonly kerbInset: number;
  readonly kerbOutset: number;
  readonly length: number;
  /**
   * Main-loop progress (m from the start line) where each timing sector starts; the first is 0.
   * On a route it is the main loop's, since lap timing always runs on main-loop progress.
   */
  readonly sectorStarts: readonly number[];
  /** Closed loop: segment i goes from sample i to sample (i + 1) % n. Sample 0 is the start line. */
  readonly samples: readonly TrackSample[];
  readonly sides: Readonly<Record<TrackSide, TrackSideInfo>>;
  /** All walls the cars hit: with branches, the outline of every road together (see buildTrack). */
  readonly walls: readonly WallSegment[];
  readonly centerGrid: SegmentGrid;
  readonly wallGrid: SegmentGrid;
  /**
   * One complete loop per branch (the main loop with that branch instead of the stretch it skips),
   * used to locate cars on the branch and to plan a bot's line through it. Empty without branches.
   */
  readonly routes: readonly Track[];
  /** On a route: where its branch runs. Absent on the main loop. */
  readonly branch?: BranchSpan;
  /** On a route: true for the pit lane's (Phase 4, `buildTrack(…, { pitLane: true })`). */
  readonly pit?: boolean;
}
