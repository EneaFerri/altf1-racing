import { TRACK_RULES } from '../config/track';
import { closestPointOnSegment } from '../math/geometry';
import { add, distance, dot, lerp, normalize, scale, sub, type Vec2 } from '../math/vec2';
import type { BranchSpan, Surface, Track, TrackSide } from './types';

export interface TrackLocation {
  /** The road the point is on: -1 = main loop, else the index in `Track.routes`. */
  readonly route: number;
  /** Segment index on that road (from sample `index` to the next one). */
  readonly index: number;
  /** Closest point on the centreline. */
  readonly point: Vec2;
  /** Driving direction at that point (unit). */
  readonly tangent: Vec2;
  /** Signed distance from the centreline: positive = right of the driving direction (m). */
  readonly lateral: number;
  /** Progress from the start line (m), measured along the main loop (also on a branch). */
  readonly distance: number;
  /** Half of the asphalt width at this point (m). */
  readonly halfWidth: number;
}

/**
 * Where `p` is on the track: the closest centreline point of the road it is most inside (main
 * loop, or a branch: see `Track.routes`), with progress measured along the main loop.
 */
export function locateOnTrack(track: Track, p: Vec2): TrackLocation {
  let best = locateOnLoop(track, p);
  track.routes.forEach((road, route) => {
    const loc = locateOnLoop(road, p);
    const branch = road.branch!;
    if (loc.distance < branch.from || loc.distance > branch.to) return;
    if (Math.abs(loc.lateral) - loc.halfWidth < Math.abs(best.lateral) - best.halfWidth) {
      best = { ...loc, route, distance: routeProgress(branch, loc.distance) };
    }
  });
  return best;
}

/** Main-loop progress of distance `d` along a route: linear across its branch, offset after it. */
export function routeProgress(span: BranchSpan, d: number): number {
  if (d <= span.from) return d;
  if (d >= span.to) return d - span.to + span.mainTo;
  return span.mainFrom + ((d - span.from) / (span.to - span.from)) * (span.mainTo - span.mainFrom);
}

/** The road `route` of `track` (-1 = the main loop itself). */
export function roadOf(track: Track, route: number): Track {
  return route < 0 ? track : track.routes[route]!;
}

/**
 * Closest point of one closed road's centreline to `p`, ignoring branches (distance along that
 * road). Uses the grid near the road, a full scan far away.
 */
export function locateOnLoop(track: Track, p: Vec2): TrackLocation {
  const n = track.samples.length;
  const nearby = track.centerGrid.query(p, track.maxHalfWidth + track.runoffWidth + 10);
  const candidates = nearby.length > 0 ? nearby : track.samples.map((_, i) => i);

  let best = { index: 0, t: 0, point: track.samples[0]!.position, dist: Infinity };
  for (const i of candidates) {
    const a = track.samples[i]!;
    const b = track.samples[(i + 1) % n]!;
    const { t, point } = closestPointOnSegment(p, a.position, b.position);
    const dist = distance(p, point);
    if (dist < best.dist) best = { index: i, t, point, dist };
  }

  const a = track.samples[best.index]!;
  const b = track.samples[(best.index + 1) % n]!;
  const tangent = normalize(lerp(a.tangent, b.tangent, best.t));
  const normal = normalize(lerp(a.normal, b.normal, best.t));
  const segmentLength = distance(a.position, b.position);
  return {
    route: -1,
    index: best.index,
    point: best.point,
    tangent,
    lateral: dot(sub(p, best.point), normal),
    distance: (a.distance + segmentLength * best.t) % track.length,
    halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * best.t,
  };
}

/** Surface under point `p`, from its lateral distance to the centreline. See 01_docs/track.md. */
export function surfaceAt(track: Track, p: Vec2): Surface {
  const loc = locateOnTrack(track, p);
  const side: TrackSide = loc.lateral >= 0 ? 'right' : 'left';
  const offset = Math.abs(loc.lateral);
  const info = roadOf(track, loc.route).sides[side];
  const kerb = info.kerb[loc.index]!;

  const edge = loc.halfWidth;

  if (offset <= edge - TRACK_RULES.kerbInset) return 'asphalt';
  if (offset <= edge + TRACK_RULES.kerbOutset && kerb !== 'none') {
    return kerb === 'high' ? 'highKerb' : 'kerb';
  }
  if (offset <= edge) return 'asphalt';
  return info.runoff[loc.index]!;
}

export interface Pose {
  readonly position: Vec2;
  /** Unit driving direction. */
  readonly direction: Vec2;
}

/** Lateral offset of the two grid columns from the centreline (m). */
const GRID_COLUMN_OFFSET = 4;

/** Starting grid slot `slot` (0 = pole): staggered rows behind the start line. */
export function gridSlot(track: Track, slot: number): Pose {
  const n = track.samples.length;
  const metresBack = 10 + slot * 8;
  const index = (n - Math.round(metresBack / TRACK_RULES.sampleSpacing)) % n;
  const sample = track.samples[index]!;
  const lateral = (slot % 2 === 0 ? -1 : 1) * GRID_COLUMN_OFFSET;
  return {
    position: add(sample.position, scale(sample.normal, lateral)),
    direction: sample.tangent,
  };
}
