import { locateOnTrack, vec2, type Track, type TrackSide, type Vec2 } from '@altf1/shared';

// Pure placement helpers for scenery (no Three.js): where props may stand. Tested in placement.test.ts.

/** A round footprint on the ground (m). */
export interface Circle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export interface Area {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** How far `p` is outside the walls (asphalt + run-off); negative = inside the drivable area. */
export function clearance(track: Track, p: Vec2): number {
  const loc = locateOnTrack(track, p);
  return Math.abs(loc.lateral) - loc.halfWidth - track.runoffWidth;
}

/** The track's bounding box, grown by `margin` on every side. */
export function trackBounds(track: Track, margin = 0): Area {
  const xs = track.samples.map((s) => s.position.x);
  const zs = track.samples.map((s) => s.position.z);
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minZ: Math.min(...zs) - margin,
    maxZ: Math.max(...zs) + margin,
  };
}

/** Same sequence on every load, so the scenery never changes between sessions. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/**
 * Up to `count` seeded random points in `area`, each at least `margin` outside the walls, outside
 * every `avoid` circle and `spacing` away from the others. Gives up after a fixed number of tries.
 */
export function scatter(
  track: Track,
  count: number,
  area: Area,
  {
    seed,
    margin,
    spacing,
    avoid = [],
  }: {
    seed: number;
    margin: number;
    spacing: number;
    avoid?: readonly Circle[];
  },
): Vec2[] {
  const random = seededRandom(seed);
  const points: Vec2[] = [];
  for (let attempt = 0; attempt < count * 30 && points.length < count; attempt++) {
    const p = vec2(
      area.minX + random() * (area.maxX - area.minX),
      area.minZ + random() * (area.maxZ - area.minZ),
    );
    if (avoid.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r)) continue;
    if (points.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < spacing)) continue;
    if (clearance(track, p) < margin) continue;
    points.push(p);
  }
  return points;
}

/** Circles of radius `r` every `step` metres along a polyline: its footprint for `avoid`. */
export function polylineFootprint(points: readonly Vec2[], r: number, step = r): Circle[] {
  const circles: Circle[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k < steps; k++) {
      circles.push({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps, r });
    }
  }
  const last = points[points.length - 1]!;
  circles.push({ x: last.x, z: last.z, r });
  return circles;
}

/** A spot beside the track: position, the driving direction there, and which way is the track. */
export interface Trackside {
  readonly position: Vec2;
  readonly tangent: Vec2;
  /** Unit vector from the spot towards the centreline. */
  readonly towardsTrack: Vec2;
  /** Distance along the track of the matching centreline point (m). */
  readonly distance: number;
}

/**
 * The spot `gap` metres beyond the wall on `side` of the centreline point closest to `near`
 * (e.g. a control point), `along` metres further down the track.
 */
export function besideTrack(
  track: Track,
  near: Vec2,
  side: TrackSide,
  gap: number,
  along = 0,
): Trackside {
  const n = track.samples.length;
  const start = locateOnTrack(track, near).index;
  const index = (start + Math.round((along * n) / track.length) + n) % n;
  const s = track.samples[index]!;
  const k = side === 'right' ? 1 : -1;
  const offset = k * (s.halfWidth + track.runoffWidth + gap);
  return {
    position: vec2(s.position.x + s.normal.x * offset, s.position.z + s.normal.z * offset),
    tangent: s.tangent,
    towardsTrack: vec2(-s.normal.x * k, -s.normal.z * k),
    distance: s.distance,
  };
}

/**
 * One apex per corner: a corner is a run of samples turning the same way tighter than
 * `minCurvature`; its apex is the tightest sample. Runs closer than `minGap` m (same way) merge.
 */
export function cornerApexes(
  track: Track,
  minCurvature: number,
  minGap: number,
): { readonly index: number; readonly direction: TrackSide }[] {
  const { samples, length } = track;
  const n = samples.length;
  const turn = (i: number): number => {
    const k = samples[i]!.curvature;
    return Math.abs(k) >= minCurvature ? Math.sign(k) : 0;
  };
  // Start scanning where the track doesn't turn, so no corner is split by the start line.
  const start = Math.max(
    0,
    samples.findIndex((_, i) => turn(i) === 0),
  );
  const corners: { index: number; direction: TrackSide; end: number }[] = [];
  for (let step = 0; step < n; step++) {
    const i = (start + step) % n;
    const way = turn(i);
    if (way === 0) continue;
    const direction: TrackSide = way > 0 ? 'right' : 'left';
    const last = corners[corners.length - 1];
    const gap = last ? (samples[i]!.distance - samples[last.end]!.distance + length) % length : 0;
    if (last && last.direction === direction && gap < minGap) {
      last.end = i;
      if (Math.abs(samples[i]!.curvature) > Math.abs(samples[last.index]!.curvature)) {
        last.index = i;
      }
    } else {
      corners.push({ index: i, direction, end: i });
    }
  }
  return corners.map(({ index, direction }) => ({ index, direction }));
}
