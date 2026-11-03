/**
 * Elevation helpers (Phase 3, 01_docs/elevation.md): the land's height from the DEM grid that
 * terrain.ts downloads, and the track's OpenF1 heights aligned onto it. Pure but `elevationOf`.
 */
import type { Point } from './geometry.ts';
import { dataOf, type CircuitConfig } from './circuits.ts';
import { osmMetres, readJson, terrainPath, type CircuitProfile, type OsmFrame } from './openf1.ts';

/** What terrain.ts saves (`data/<id>.terrain.json`): land heights on a regular lat/lon grid. */
export interface RawTerrain {
  readonly dataset: string;
  readonly attribution: string;
  /** South-west corner of the grid (degrees) and its step (degrees). */
  readonly lat0: number;
  readonly lon0: number;
  readonly dLat: number;
  readonly dLon: number;
  readonly rows: number;
  readonly cols: number;
  /** Row by row from the south, west to east (m above sea level); null: no land (the sea). */
  readonly heights: readonly (number | null)[];
}

/** The land's height at [lat, lon] (bilinear; the sea counts as 0); null outside the grid. */
export function landHeight(
  terrain: RawTerrain,
  [lat, lon]: readonly [number, number],
): number | null {
  const r = (lat - terrain.lat0) / terrain.dLat;
  const c = (lon - terrain.lon0) / terrain.dLon;
  if (r < 0 || c < 0 || r > terrain.rows - 1 || c > terrain.cols - 1) return null;
  const r0 = Math.min(Math.floor(r), terrain.rows - 2);
  const c0 = Math.min(Math.floor(c), terrain.cols - 2);
  const at = (i: number, j: number): number => terrain.heights[i * terrain.cols + j] ?? 0;
  const fr = r - r0;
  const fc = c - c0;
  const south = at(r0, c0) * (1 - fc) + at(r0, c0 + 1) * fc;
  const north = at(r0 + 1, c0) * (1 - fc) + at(r0 + 1, c0 + 1) * fc;
  return south * (1 - fr) + north * fr;
}

/** The profile's frame (m, y north) → [lat, lon]: the inverse of `osmToProfile`. */
export function profileToOsm(frame: OsmFrame): (p: Point) => [number, number] {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  const perLon = osmMetres(frame.lat0)([0, 1])[0];
  return ([x, y]) => {
    const dx = x - frame.tx;
    const dy = y - frame.ty;
    const mx = dx * cos + dy * sin;
    const my = -dx * sin + dy * cos;
    return [my / 110574, mx / perLon];
  };
}

export interface AlignedHeights {
  /** Each station's height above sea level (m, real scale). */
  readonly heights: readonly number[];
  /** What was added to OpenF1's heights (m). */
  readonly offset: number;
  /** The land's height under each station (m; the tunnel's roof where the road runs under it). */
  readonly land: readonly number[];
}

/**
 * The profile's heights moved onto the land: OpenF1's z has its own zero, so it is shifted by the
 * median gap to the DEM under the stations (a median: the tunnel, under the town, doesn't count),
 * or, given `lowest`, so that the lowest point is that high (m above sea level: Monaco's harbour
 * front on its quay, where the DEM's 25 m cells mix road and sea).
 */
export function alignHeights(
  profile: CircuitProfile,
  terrain: RawTerrain,
  lowest?: number,
): AlignedHeights {
  if (!profile.heights)
    throw new Error(`${profile.name}: no heights in the profile (fetch, profile)`);
  const toOsm = profileToOsm(profile.osmFrame);
  const land = profile.stations.map((p) => landHeight(terrain, toOsm(p as Point)) ?? 0);
  const gaps = land.map((h, i) => h - profile.heights![i]!).sort((a, b) => a - b);
  const offset =
    lowest === undefined
      ? gaps[Math.floor(gaps.length / 2)]!
      : lowest - Math.min(...profile.heights);
  return { heights: profile.heights.map((h) => h + offset), offset, land };
}

/**
 * A circuit's station heights for its layout (real m above sea level), when it has elevation
 * (`CircuitConfig.elevation`): the profile's aligned onto the land in `data/<data>.terrain.json`.
 */
export function elevationOf(
  circuit: CircuitConfig,
  profile: CircuitProfile,
): readonly number[] | undefined {
  if (!circuit.elevation) return undefined;
  return alignHeights(
    profile,
    readJson<RawTerrain>(terrainPath(dataOf(circuit))),
    circuit.lowestHeight,
  ).heights;
}
