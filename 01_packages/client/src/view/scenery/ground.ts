import { locateOnTrack, vec2, type Track, type Vec2 } from '@altf1/shared';
import { clearance, insidePolygon, trackBounds } from './placement';

// The ground's height around an elevated track (Phase 3: Monaco v2; 01_docs/elevation.md). Pure.
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
 * Height of the ground on the real land (Monaco v2): the road less GROUND_DROP under it; past the
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
 * the triangle's vertices go down until it is GROUND_DROP under the road there. Returns how many
 * points needed it on the first pass.
 */
export function settleUnderRoad(grid: GroundGrid, track: Track): number {
  let first = -1;
  for (let pass = 0; pass < 8; pass++) {
    let raised = 0;
    for (const s of track.samples) {
      const reach = s.halfWidth + track.runoffWidth + 0.5;
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
 * track, settled under the road (`settleUnderRoad`). SceneView draws it; props stand on it.
 */
export function elevatedGround(track: Track, height: (p: Vec2) => number): GroundGrid {
  const grid = groundGrid(trackBounds(track, GRID_MARGIN), GRID_CELL, height);
  settleUnderRoad(grid, track);
  return grid;
}
