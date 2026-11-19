import { locateOnTrack, vec2, type Track, type Vec2 } from '@altf1/shared';
import { clearance, insidePolygon, polygonBounds, trackBounds } from './placement';

// The ground's height around an elevated track (Phase 3: Monaco, São Paulo; 01_docs/elevation.md). Pure.
// On a flat track it is 0 everywhere. Under the road it is always the road less GROUND_DROP.

/** The ground sits this far under the road and its run-off, so it never shows through (m). */
export const GROUND_DROP = 0.5;
/** One sample in this many counts for the ground's height (samples are 2 m apart). */
const EVERY = 4;
/**
 * With the real land, past the walls: the ground follows the road up to LAND_FROM m, then blends
 * into the land until LAND_TO m. The DEM is a surface model: in a dense town it counts the
 * buildings, so near the track the road's heights are the better ground (Monaco's streets run at
 * the track's levels); further out it gives the upper town and the hills.
 */
const LAND_FROM = 40;
const LAND_TO = 200;
/** Under the sea the ground lies this deep (the water is drawn at 0). */
export const SEA_FLOOR = -3;

/** The land around a track on a grid in game coordinates (generated `themes/<id>Land.ts`). */
export interface LandGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** m above sea level, row by row: `heights[row * cols + col]`. */
  readonly heights: readonly number[];
}

/** Where a point stands relative to the track, and the road's heights around it. */
interface RoadSurround {
  /** How far beyond the walls (≤ 0: on the road or its run-off). */
  readonly beyond: number;
  /** The road's height under it, or around it: the lap's heights weighted by 1 / distance⁴. */
  readonly height: number;
}

/** The road's heights around a point, and whether it lies beyond the walls. */
function roadSurround(track: Track): (p: Vec2) => RoadSurround {
  const points = track.samples
    .filter((_, i) => i % EVERY === 0)
    .map((s) => ({ x: s.position.x, z: s.position.z, h: s.height }));
  // Further than this from every counted sample, a point is surely beyond the walls.
  const spacing =
    2 *
    EVERY *
    Math.max(
      ...track.samples.map((s, i) => (i > 0 ? s.distance - track.samples[i - 1]!.distance : 0)),
    );
  const wallReach = track.maxHalfWidth + track.runoffWidth + spacing;
  return (p) => {
    let sum = 0;
    let weights = 0;
    let nearest = Infinity;
    for (const s of points) {
      const d2 = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (d2 < nearest) nearest = d2;
      const w = 1 / (d2 + 25) ** 2;
      sum += w * s.h;
      weights += w;
    }
    if (nearest < wallReach * wallReach) {
      const beyond = clearance(track, p);
      if (beyond <= 0) return { beyond, height: locateOnTrack(track, vec2(p.x, p.z)).height };
      return { beyond, height: sum / weights };
    }
    return { beyond: Math.sqrt(nearest), height: sum / weights };
  };
}

/**
 * Height of the ground from the track alone: under the road and its run-off, the road less
 * GROUND_DROP; beyond the walls, the lap's heights weighted by 1 / distance⁴, so the nearest
 * stretch decides by the wall (level with the road: the wall hides the drop) and two stretches at
 * different heights are joined by a continuous slope, never a step.
 */
export function trackGroundHeight(track: Track): (p: Vec2) => number {
  if (!track.elevated) return () => 0;
  const road = roadSurround(track);
  return (p) => {
    const r = road(p);
    return r.beyond <= 0 ? r.height - GROUND_DROP : r.height;
  };
}

/** The land's height at a point (bilinear between the grid's heights, clamped at its edges). */
export function landHeightAt(land: LandGrid, p: Vec2): number {
  const fx = Math.min(land.cols - 1.001, Math.max(0, (p.x - land.minX) / land.cell));
  const fz = Math.min(land.rows - 1.001, Math.max(0, (p.z - land.minZ) / land.cell));
  const c = Math.floor(fx);
  const r = Math.floor(fz);
  const u = fx - c;
  const v = fz - r;
  const at = (dc: number, dr: number): number => land.heights[(r + dr) * land.cols + c + dc]!;
  return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
}

/**
 * Height of the ground on the real land (Monaco): the road less GROUND_DROP under it; past the
 * walls, the road's heights around, then the land's (LAND_FROM → LAND_TO); SEA_FLOOR inside the
 * `sea` (OSM's, already kept off the walls), so the coast is a quay wall.
 */
export function landGroundHeight(
  land: LandGrid,
  sea: readonly (readonly Vec2[])[],
): (track: Track) => (p: Vec2) => number {
  return (track) => {
    const road = roadSurround(track);
    return (p) => {
      const r = road(p);
      if (r.beyond <= 0) return r.height - GROUND_DROP;
      if (sea.some((ring) => insidePolygon(p, ring))) return SEA_FLOOR;
      const f = Math.min(1, Math.max(0, (r.beyond - LAND_FROM) / (LAND_TO - LAND_FROM)));
      const eased = f * f * (3 - 2 * f);
      return r.height + (landHeightAt(land, p) - r.height) * eased;
    };
  };
}

/** On the real land, a lake's bed lies this far under its water (m). */
export const LAKE_DEPTH = 2;
/** A lake's shore is sampled this often to find its level (m). */
const SHORE_STEP = 4;
/** Past its shore, the land eases from the lake's level to its own over this far (m). */
export const SHORE_BAND = 30;

/** Points along a ring's edges, about SHORE_STEP m apart. */
function shorePoints(ring: readonly Vec2[]): Vec2[] {
  return ring.flatMap((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SHORE_STEP));
    return Array.from({ length: steps }, (_, k) => ({
      x: a.x + ((b.x - a.x) * k) / steps,
      z: a.z + ((b.z - a.z) * k) / steps,
    }));
  });
}

/**
 * A lake's water level on the land (São Paulo's): the median of the dry ground along its shore.
 * Not its lowest point: the DEM is a surface model (SRTM counts the trees on the bank), so the
 * shore it gives is uneven by metres; `withLakes` eases the bank to this level instead.
 */
export function lakeLevel(dry: (p: Vec2) => number, ring: readonly Vec2[]): number {
  const heights = shorePoints(ring)
    .map(dry)
    .sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)]!;
}

/** Distance from `p` to a ring's edges (m). */
function distanceToRing(p: Vec2, ring: readonly Vec2[]): number {
  let best = Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
  });
  return best;
}

/**
 * The ground with its lakes in it: inside each, LAKE_DEPTH under its level (`lakeLevel`); past the
 * shore, eased from that level to the land over SHORE_BAND m, so the water lies flat between
 * gentle banks and never floats above the ground nor sits in a pit.
 */
export function withLakes(
  dry: (p: Vec2) => number,
  lakes: readonly (readonly Vec2[])[],
): (p: Vec2) => number {
  const shores = lakes.map((ring) => ({
    ring,
    bounds: polygonBounds(ring),
    level: lakeLevel(dry, ring),
  }));
  return (p) => {
    const h = dry(p);
    for (const { ring, bounds: b, level } of shores) {
      if (
        p.x < b.minX - SHORE_BAND ||
        p.x > b.maxX + SHORE_BAND ||
        p.z < b.minZ - SHORE_BAND ||
        p.z > b.maxZ + SHORE_BAND
      ) {
        continue;
      }
      if (insidePolygon(p, ring)) return level - LAKE_DEPTH;
      const d = distanceToRing(p, ring);
      if (d >= SHORE_BAND) continue;
      const f = d / SHORE_BAND;
      return level + (h - level) * f * f * (3 - 2 * f);
    }
    return h;
  };
}

/** The ground as a grid of heights: `cols` × `rows` vertices `cell` m apart from (minX, minZ). */
export interface GroundGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** Row by row (z), each from minX: `heights[row * cols + col]`. */
  readonly heights: Float64Array;
}

/** A grid of `height` over `area`, vertices `cell` m apart. */
export function groundGrid(
  area: { minX: number; maxX: number; minZ: number; maxZ: number },
  cell: number,
  height: (p: Vec2) => number,
): GroundGrid {
  const cols = Math.ceil((area.maxX - area.minX) / cell) + 1;
  const rows = Math.ceil((area.maxZ - area.minZ) / cell) + 1;
  const heights = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      heights[r * cols + c] = height({ x: area.minX + c * cell, z: area.minZ + r * cell });
    }
  }
  return { minX: area.minX, minZ: area.minZ, cell, cols, rows, heights };
}

/**
 * The grid's cell triangles, as the mesh draws them: cell (c, r) is split along its diagonal from
 * (c, r) to (c + 1, r + 1). The three vertex indices of the triangle holding (x, z), with weights.
 */
export function gridTriangle(
  grid: GroundGrid,
  x: number,
  z: number,
): {
  readonly vertices: readonly [number, number, number];
  readonly weights: readonly [number, number, number];
} | null {
  const fx = (x - grid.minX) / grid.cell;
  const fz = (z - grid.minZ) / grid.cell;
  const c = Math.floor(fx);
  const r = Math.floor(fz);
  if (c < 0 || r < 0 || c >= grid.cols - 1 || r >= grid.rows - 1) return null;
  const u = fx - c;
  const v = fz - r;
  const at = (dc: number, dr: number): number => (r + dr) * grid.cols + (c + dc);
  // Below the diagonal (u ≥ v): (c, r), (c+1, r), (c+1, r+1); above: (c, r), (c+1, r+1), (c, r+1).
  return u >= v
    ? { vertices: [at(0, 0), at(1, 0), at(1, 1)], weights: [1 - u, u - v, v] }
    : { vertices: [at(0, 0), at(1, 1), at(0, 1)], weights: [1 - v, u, v - u] };
}

/** The drawn ground's height at (x, z): linear over its triangles. */
export function gridHeightAt(grid: GroundGrid, x: number, z: number): number | null {
  const t = gridTriangle(grid, x, z);
  if (!t) return null;
  return t.vertices.reduce((sum, i, k) => sum + grid.heights[i]! * t.weights[k]!, 0);
}

/** Every point of the road and its run-off checked against the ground, ~this far apart (m). */
const CHECK_STEP = 1.5;

/**
 * Lowers the grid wherever its triangles rise above the road or its run-off (an 8 m triangle
 * joining a point under a low stretch to one by a higher stretch can cross the low one's edge):
 * the triangle's vertices go down until it is GROUND_DROP under the road there. Under the main
 * loop, and with `routes` under each route's own stretch too (the Grand Prix's pit lane: no grass
 * through it). Returns how many points needed it on the first pass.
 */
export function settleUnderRoad(grid: GroundGrid, track: Track, routes = false): number {
  // Each sample with how far either side of its centre the ground must lie under it.
  const under = [
    ...track.samples.map((s) => ({ s, reach: s.halfWidth + track.runoffWidth + 0.5 })),
    ...(routes ? track.routes : []).flatMap((road) =>
      road.samples
        .filter(
          (s) => !road.branch || (s.distance >= road.branch.from && s.distance <= road.branch.to),
        )
        .map((s) => ({ s, reach: s.halfWidth + road.runoffWidth + 0.5 })),
    ),
  ];
  let first = -1;
  for (let pass = 0; pass < 8; pass++) {
    let raised = 0;
    for (const { s, reach } of under) {
      for (let o = -reach; o <= reach; o += CHECK_STEP) {
        const x = s.position.x + s.normal.x * o;
        const z = s.position.z + s.normal.z * o;
        const t = gridTriangle(grid, x, z);
        if (!t) continue;
        const h = t.vertices.reduce((sum, i, k) => sum + grid.heights[i]! * t.weights[k]!, 0);
        const excess = h - (s.height - GROUND_DROP);
        if (excess <= 0.01) continue;
        raised++;
        for (const i of t.vertices) grid.heights[i] = grid.heights[i]! - excess;
      }
    }
    if (first < 0) first = raised;
    if (raised === 0) break;
  }
  return first;
}

/** The elevated ground's grid: cell (m) and how far it reaches past the track (m). */
const GRID_CELL = 8;
const GRID_MARGIN = 400;

/**
 * The ground an elevated track is drawn on: `height` on a GRID_CELL m grid GRID_MARGIN m round the
 * track, settled under the road (`settleUnderRoad`; with `routes` under the routes too). SceneView
 * draws it; props stand on it.
 */
export function elevatedGround(
  track: Track,
  height: (p: Vec2) => number,
  routes = false,
): GroundGrid {
  const grid = groundGrid(trackBounds(track, GRID_MARGIN), GRID_CELL, height);
  settleUnderRoad(grid, track, routes);
  return grid;
}
