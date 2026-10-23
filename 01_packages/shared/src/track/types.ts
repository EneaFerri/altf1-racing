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
}

/** Compiled, immutable track used by both Model and View. Static: never part of GameState. */
export interface Track {
  readonly name: string;
  /** Widest half-width anywhere on the track (m), for search radii. */
  readonly maxHalfWidth: number;
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
}
