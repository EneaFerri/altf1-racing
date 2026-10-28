import { locateOnTrack, roadOf, vec2, type Track, type TrackSide, type Vec2 } from '@altf1/shared';

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

/**
 * A point given relative to the track, so it stays beside the track whatever its width: lap
 * fraction (0 = start line, along the main loop) and metres beyond the wall (+ right, − left).
 */
export type TrackSpot = readonly [at: number, gap: number];

/** Where a `TrackSpot` is on the ground. */
export function fromTrack(track: Track, [at, gap]: TrackSpot): Vec2 {
  const n = track.samples.length;
  const s = track.samples[((Math.round(at * n) % n) + n) % n]!;
  const offset = Math.sign(gap) * (s.halfWidth + track.runoffWidth + Math.abs(gap));
  return vec2(s.position.x + s.normal.x * offset, s.position.z + s.normal.z * offset);
}

/** A `TrackSpot` path as ground points every ~`step` m (interpolated along the track). */
export function alongTrack(track: Track, path: readonly TrackSpot[], step: number): Vec2[] {
  const points: Vec2[] = [];
  path.forEach((spot, i) => {
    const next = path[i + 1];
    if (!next) {
      points.push(fromTrack(track, spot));
      return;
    }
    // Lap fractions wrap over the line: take the short way round.
    const dAt = ((((next[0] - spot[0]) % 1) + 1.5) % 1) - 0.5;
    const steps = Math.max(1, Math.ceil((Math.abs(dAt) * track.length) / step));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      points.push(fromTrack(track, [spot[0] + dAt * f, spot[1] + (next[1] - spot[1]) * f]));
    }
  });
  return points;
}

/** A rectangular footprint beside the track: its front centre, facing direction and size. */
export interface Footprint {
  /** Middle of the side nearest the track, on the ground. */
  readonly front: Vec2;
  /** Unit vector from the footprint towards the track. */
  readonly towardsTrack: Vec2;
  /** Along the track, and away from it (m). */
  readonly length: number;
  readonly depth: number;
}

/** The box around a footprint (e.g. a grandstand's), aligned with the track beside it. */
export function footprintBox(track: Track, spots: readonly TrackSpot[]): Footprint {
  const points = spots.map((s) => fromTrack(track, s));
  const c = vec2(
    points.reduce((sum, p) => sum + p.x, 0) / points.length,
    points.reduce((sum, p) => sum + p.z, 0) / points.length,
  );
  const loc = locateOnTrack(track, c);
  const normal = roadOf(track, loc.route).samples[loc.index]!.normal;
  // Unit vector pointing away from the track, through the footprint.
  const dir = loc.lateral >= 0 ? normal : vec2(-normal.x, -normal.z);
  const along = points.map((p) => (p.x - c.x) * loc.tangent.x + (p.z - c.z) * loc.tangent.z);
  // `dir` points away from the track: the front is the smallest projection on it.
  const across = points.map((p) => (p.x - c.x) * dir.x + (p.z - c.z) * dir.z);
  const midAlong = (Math.max(...along) + Math.min(...along)) / 2;
  const front = Math.min(...across);
  return {
    front: vec2(
      c.x + loc.tangent.x * midAlong + dir.x * front,
      c.z + loc.tangent.z * midAlong + dir.z * front,
    ),
    towardsTrack: vec2(-dir.x, -dir.z),
    length: Math.max(...along) - Math.min(...along),
    depth: Math.max(...across) - front,
  };
}

/**
 * A building beside the track: its body this far beyond the walls, its roof (high up) at most this
 * far over the run-off (m).
 */
const BODY_CLEARANCE = 0.5;
const ROOF_OVERHANG = 2.5;

/** How far a drawn building reaches from its footprint's front: `back` behind, `roof` in front (m). */
export interface Reach {
  readonly back: number;
  readonly roof: number;
}

/**
 * True when a building drawn on `box` (roof 1 m longer each end) stays off the track: its body at
 * least `BODY_CLEARANCE` beyond the walls, its roof (high up) at most `ROOF_OVERHANG` over the run-off.
 */
export function fitsBeside(track: Track, box: Footprint, reach: Reach): boolean {
  const t = box.towardsTrack;
  const along = vec2(-t.z, t.x);
  const half = box.length / 2 + 1;
  // Every ~2 m along it, every ~metre across, edges included.
  const steps = Math.max(2, Math.ceil(half / 2));
  const rows = Math.ceil(reach.back + reach.roof);
  for (let i = -steps; i <= steps; i++) {
    const a = (half * i) / steps;
    for (let j = 0; j <= rows; j++) {
      const d = -reach.back + ((reach.back + reach.roof) * j) / rows;
      const p = vec2(box.front.x + along.x * a + t.x * d, box.front.z + along.z * a + t.z * d);
      // Only the roof reaches past the ends and the front.
      const body = d <= 0 && Math.abs(a) <= box.length / 2;
      if (clearance(track, p) < (body ? BODY_CLEARANCE : -ROOF_OVERHANG)) return false;
    }
  }
  return true;
}

/**
 * Where to draw a stand on `spots`: its own box when that fits beside the track; else (a long stand
 * on a bend, whose straight box would cut into the track) pieces about `pieceLength` m long that
 * follow the track at the footprint's nearest gap, leaving out those that don't fit.
 */
export function standPieces(
  track: Track,
  spots: readonly TrackSpot[],
  reach: Reach,
  pieceLength: number,
): Footprint[] {
  const whole = footprintBox(track, spots);
  if (fitsBeside(track, whole, reach)) return [whole];
  const ats = spots.map(([at]) => at);
  let from = Math.min(...ats);
  let to = Math.max(...ats);
  if (to - from > 0.5) {
    // Over the line: from its end of the lap round to its start.
    from = Math.min(...ats.filter((a) => a >= 0.5));
    to = 1 + Math.max(...ats.filter((a) => a < 0.5));
  }
  const nearest = spots.reduce((a, b) => (Math.abs(b[1]) < Math.abs(a[1]) ? b : a))[1];
  const far = nearest + Math.sign(nearest) * reach.back;
  const count = Math.max(1, Math.round(((to - from) * track.length) / pieceLength));
  const pieces: Footprint[] = [];
  for (let k = 0; k < count; k++) {
    const a = (from + ((to - from) * k) / count) % 1;
    const b = (from + ((to - from) * (k + 1)) / count) % 1;
    const piece = footprintBox(track, [
      [a, nearest],
      [b, nearest],
      [b, far],
      [a, far],
    ]);
    if (fitsBeside(track, piece, reach)) pieces.push(piece);
  }
  return pieces;
}

/** True when `p` is inside the polygon (even-odd rule). */
export function insidePolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** The bounding box of a polygon. */
export function polygonBounds(polygon: readonly Vec2[]): Area {
  return {
    minX: Math.min(...polygon.map((p) => p.x)),
    maxX: Math.max(...polygon.map((p) => p.x)),
    minZ: Math.min(...polygon.map((p) => p.z)),
    maxZ: Math.max(...polygon.map((p) => p.z)),
  };
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
 * Up to `count` seeded random points in `area` (and `inside` a polygon, when given), each at least
 * `margin` outside the walls, outside every `avoid` circle and `spacing` away from the others.
 * Gives up after a fixed number of tries.
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
    inside,
  }: {
    seed: number;
    margin: number;
    spacing: number;
    avoid?: readonly Circle[];
    inside?: readonly Vec2[];
  },
): Vec2[] {
  // Far from every road's centreline the walls can't be within `margin`: skip the costly check.
  const roads = [track, ...track.routes];
  const near = (p: Vec2): boolean =>
    roads.some((r) => r.centerGrid.query(p, r.maxHalfWidth + r.runoffWidth + margin).length > 0);
  const random = seededRandom(seed);
  const points: Vec2[] = [];
  for (let attempt = 0; attempt < count * 30 && points.length < count; attempt++) {
    const p = vec2(
      area.minX + random() * (area.maxX - area.minX),
      area.minZ + random() * (area.maxZ - area.minZ),
    );
    if (inside && !insidePolygon(p, inside)) continue;
    if (avoid.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r)) continue;
    if (points.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < spacing)) continue;
    if (near(p) && clearance(track, p) < margin) continue;
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

/** A boat moored stern-to: its middle, the unit direction its bow points, its length (m). */
export interface Mooring {
  readonly at: Vec2;
  readonly bow: Vec2;
  readonly length: number;
}

/** Boats: length range (m), beam per length, the gap between two, the stern's gap off a pier (m). */
const BOAT_LENGTH: readonly [number, number] = [14, 46];
const BOAT_BEAM = 0.22;
const BOAT_GAP = 1.2;
const STERN_OFF = 2;
const AREA_STERN_OFF = 0.5;
const PIER_CLEAR = 1;

/**
 * Boats moored stern-to along pontoons (Monaco's way): both sides of every pier line, the outer
 * side of every edge of a pier area; one every beam + gap, seeded lengths. A boat is kept only if
 * its four corners are on `water` and off every pier area, its bow corners at least PIER_CLEAR from
 * every pier, and `clear` (e.g. off the track); never overlapping another.
 */
export function mooredBoats(
  piers: readonly { readonly points: readonly Vec2[]; readonly area: boolean }[],
  water: readonly (readonly Vec2[])[],
  clear: (p: Vec2) => boolean,
  seed: number,
): Mooring[] {
  const random = seededRandom(seed);
  // Every pier as its edges (an area's ring closed).
  const edges = piers.map((pier) => {
    const ps = pier.area ? [...pier.points, pier.points[0]!] : [...pier.points];
    return ps.slice(1).map((b, i): [Vec2, Vec2] => [ps[i]!, b]);
  });
  const areas = piers.filter((p) => p.area).map((p) => p.points);
  const toPier = (p: Vec2): number =>
    Math.min(...edges.flat().map(([a, b]) => segmentDistance(p, a, b)));
  const boats: Mooring[] = [];
  piers.forEach((pier, k) => {
    // A walkway's line is its middle; an area's edge is its side.
    const sternOff = pier.area ? AREA_STERN_OFF : STERN_OFF;
    for (const [a, b] of edges[k]!) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1) continue;
      const along = vec2((b.x - a.x) / len, (b.z - a.z) / len);
      const middle = vec2((a.x + b.x) / 2, (a.z + b.z) / 2);
      // An area moors on the outside of each edge only.
      const sides = [1, -1].filter(
        (side) =>
          !pier.area ||
          !insidePolygon(
            vec2(middle.x - along.z * side * 2, middle.z + along.x * side * 2),
            pier.points,
          ),
      );
      for (const side of sides) {
        const bow = vec2(-along.z * side, along.x * side);
        let t = BOAT_GAP;
        while (t < len) {
          const length = BOAT_LENGTH[0] + random() * (BOAT_LENGTH[1] - BOAT_LENGTH[0]);
          const beam = length * BOAT_BEAM;
          const s = t + beam / 2;
          t += beam + BOAT_GAP;
          if (s > len) break;
          const mid = length / 2 + sternOff;
          const at = vec2(a.x + along.x * s + bow.x * mid, a.z + along.z * s + bow.z * mid);
          const corners = boatCorners({ at, bow, length });
          const onWater = corners.every(
            (c) =>
              water.some((ring) => insidePolygon(c, ring)) &&
              !areas.some((ring) => insidePolygon(c, ring)),
          );
          if (!onWater || !corners.every(clear)) continue;
          if (corners.slice(2).some((c) => toPier(c) < PIER_CLEAR)) continue;
          const boat = { at, bow, length };
          // Boats of two facing pontoons meet in the middle: no overlaps.
          const overlaps = (x: Mooring, y: Mooring): boolean =>
            [y.at, ...boatCorners(y)].some((c) => onBoat(c, x));
          if (boats.some((o) => overlaps(o, boat) || overlaps(boat, o))) continue;
          boats.push(boat);
        }
      }
    }
  });
  return boats;
}

/** A boat's corners: stern pair, then bow pair. */
function boatCorners({ at, bow, length }: Mooring): Vec2[] {
  const beam = length * BOAT_BEAM;
  return [-1, 1].flatMap((f) =>
    [-1, 1].map((g) =>
      vec2(
        at.x + (bow.x * f * length) / 2 - (bow.z * g * beam) / 2,
        at.z + (bow.z * f * length) / 2 + (bow.x * g * beam) / 2,
      ),
    ),
  );
}

/** True when `p` is on the boat's rectangle. */
function onBoat(p: Vec2, { at, bow, length }: Mooring): boolean {
  const dx = p.x - at.x;
  const dz = p.z - at.z;
  return (
    Math.abs(dx * bow.x + dz * bow.z) < length / 2 &&
    Math.abs(-dx * bow.z + dz * bow.x) < (length * BOAT_BEAM) / 2
  );
}

/** Distance from `p` to the segment a–b. */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}
