import type { SegmentGrid } from '../math/SegmentGrid';
import type { Vec2 } from '../math/vec2';

export type TrackSide = 'left' | 'right';
export type KerbKind = 'none' | 'low' | 'high';
export type RunoffKind = 'grass' | 'gravel';

/** Hand-authored track data. Compiled into a `Track` by `buildTrack`. See 01_docs/track.md. */
export interface TrackDefinition {
  readonly name: string;
  /** Control points of a closed spline, in driving order (m). */
  readonly points: readonly Vec2[];
  /** Half of the asphalt width (m). */
  readonly halfWidth: number;
  /** Distance from the asphalt edge to the wall (m). */
  readonly runoffWidth: number;
  /** Ranges of control points whose corners get high kerbs on the inside. */
  readonly highKerbs: readonly { readonly fromPoint: number; readonly toPoint: number }[];
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
}

/** Compiled, immutable track used by both Model and View. Static: never part of GameState. */
export interface Track {
  readonly name: string;
  readonly halfWidth: number;
  readonly runoffWidth: number;
  readonly length: number;
  /** Closed loop: segment i goes from sample i to sample (i + 1) % n. Sample 0 is the start line. */
  readonly samples: readonly TrackSample[];
  readonly sides: Readonly<Record<TrackSide, TrackSideInfo>>;
  readonly walls: readonly WallSegment[];
  readonly centerGrid: SegmentGrid;
  readonly wallGrid: SegmentGrid;
}
