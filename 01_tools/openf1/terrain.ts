/**
 * A circuit's land heights and its track's elevation (Phase 3, 01_docs/elevation.md):
 * - downloads (`--fetch`, or when missing) the EU-DEM 25 m grid around the circuit from
 *   OpenTopoData into `data/<id>.terrain.json` (committed: rebuilds work offline);
 * - aligns the pole lap's heights (profile) onto it and reports the elevation: height difference,
 *   highest and lowest points, steepest gradients, against the published figure;
 * - writes `preview/<id>-elevation.png`: height along the lap (black: track; grey: land above it,
 *   the town over the tunnel; yellow: sector starts);
 * - for a circuit with elevation (Monaco v2), writes the client's land grid in game coordinates,
 *   `01_packages/client/src/view/themes/<id>Land.ts` (generated: never edit by hand).
 * Usage: node --import ./01_tools/resolveTs.ts 01_tools/openf1/terrain.ts <id> [--fetch]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { circuitById, dataOf } from './circuits.ts';
import { alignHeights, landHeight, profileToOsm, type RawTerrain } from './elevation.ts';
import { elevationOf } from './elevation.ts';
import { fromGame, generate } from './generate.ts';
import {
  osmPath,
  profilePath,
  readJson,
  terrainPath,
  type CircuitProfile,
  type RawOsmCircuit,
} from './openf1.ts';
import { Canvas } from './png.ts';

const API = 'https://api.opentopodata.org/v1/eudem25m';
/** Grid step (m): the DEM's own resolution. */
const STEP = 25;
/** Land fetched around the circuit's centreline (m). */
const MARGIN = 400;
/** OpenTopoData's limits: points per call, and a pause between calls (ms). */
const PER_CALL = 100;
const PAUSE = 1100;
/** Gradients are measured over this distance (m). */
const GRADIENT_RUN = 50;
/** The client's land grid: cell (m, game), how far past the track it reaches (m), and the height
 * under the sea (no land), below the water drawn at 0. */
const LAND_CELL = 12.5;
const LAND_MARGIN = 500;
const SEA_FLOOR = -3;
/**
 * EU-DEM is a surface model: in a town its cells count the roofs. A morphological opening (the
 * lowest height within this radius, then the highest of those) takes away blobs the size of
 * buildings and keeps the hills (m).
 */
const BARE_RADIUS = 40;

const circuit = circuitById(process.argv[2] ?? '');
if (process.argv.includes('--fetch') || !existsSync(terrainPath(dataOf(circuit))))
  await fetchTerrain();
report();
if (circuit.elevation) writeLand();

async function fetchTerrain(): Promise<void> {
  const nodes = readJson<RawOsmCircuit>(osmPath(dataOf(circuit))).ways.flat();
  const lats = nodes.map(([lat]) => lat);
  const lons = nodes.map(([, lon]) => lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = STEP / 110574;
  const dLon = STEP / (111320 * Math.cos((midLat * Math.PI) / 180));
  const lat0 = Math.min(...lats) - MARGIN / 110574;
  const lon0 = Math.min(...lons) - (MARGIN / STEP) * dLon;
  const rows = Math.ceil((Math.max(...lats) + MARGIN / 110574 - lat0) / dLat) + 1;
  const cols = Math.ceil((Math.max(...lons) + (MARGIN / STEP) * dLon - lon0) / dLon) + 1;
  const points: [number, number][] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) points.push([lat0 + i * dLat, lon0 + j * dLon]);
  }
  console.log(
    `${circuit.name}: ${rows} × ${cols} land heights, ${Math.ceil(points.length / PER_CALL)} calls`,
  );
  const heights: (number | null)[] = [];
  for (let k = 0; k < points.length; k += PER_CALL) {
    const batch = points.slice(k, k + PER_CALL);
    const locations = batch.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join('|');
    const results = await get(`${API}?locations=${locations}`);
    heights.push(...results.map((e) => (e === null ? null : Math.round(e * 10) / 10)));
    await new Promise((resolve) => setTimeout(resolve, PAUSE));
  }
  const terrain: RawTerrain = {
    dataset: 'EU-DEM v1.1, 25 m (via OpenTopoData)',
    attribution:
      'Produced using Copernicus data and information funded by the European Union - EU-DEM layers',
    lat0,
    lon0,
    dLat,
    dLon,
    rows,
    cols,
    heights,
  };
  writeFileSync(terrainPath(dataOf(circuit)), JSON.stringify(terrain) + '\n');
}

/** One OpenTopoData call: the heights, null where it has no land (the sea); retried when busy. */
async function get(url: string): Promise<(number | null)[]> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      const body = (await response.json()) as { results: { elevation: number | null }[] };
      return body.results.map((r) => r.elevation);
    }
    if (![429, 502, 503, 504].includes(response.status) || attempt === 5) {
      throw new Error(`OpenTopoData: HTTP ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000 * 2 ** attempt));
  }
}

function report(): void {
  const profile = readJson<CircuitProfile>(profilePath(dataOf(circuit)));
  const terrain = readJson<RawTerrain>(terrainPath(dataOf(circuit)));
  const { heights, offset, land } = alignHeights(profile, terrain, circuit.lowestHeight);
  const n = heights.length;
  const at = (i: number): number => Math.round(i * profile.spacing);
  /** The circuit's named place nearest to distance `d` (its width marks carry corner names). */
  const place = (d: number): string =>
    circuit.widths.reduce((a, b) => (Math.abs(b.at - d) < Math.abs(a.at - d) ? b : a)).place;
  const top = heights.indexOf(Math.max(...heights));
  const bottom = heights.indexOf(Math.min(...heights));
  const run = Math.round(GRADIENT_RUN / profile.spacing);
  const gradient = (i: number): number =>
    (heights[(i + run) % n]! - heights[i]!) / (run * profile.spacing);
  const grades = heights.map((_, i) => gradient(i));
  const up = grades.indexOf(Math.max(...grades));
  const down = grades.indexOf(Math.min(...grades));
  const pct = (g: number): string => `${(g * 100).toFixed(1)}%`;
  // The longest stretch more than 4 m under the land: the tunnel (the DEM's 25 m cells are too
  // coarse for the road itself: by the sea and cliffs it swings far either side of it).
  let under = { from: 0, length: 0 };
  for (let i = 0, run = 0; i < n; i++) {
    run = land[i]! - heights[i]! > 4 ? run + 1 : 0;
    if (run > under.length) under = { from: i - run + 1, length: run };
  }
  console.log(`${circuit.name}: OpenF1 heights + ${offset.toFixed(1)} m onto the land (EU-DEM)`);
  console.log(
    `  height difference ${(heights[top]! - heights[bottom]!).toFixed(1)} m: ` +
      `highest ${heights[top]!.toFixed(1)} m at ${at(top)} m (${place(at(top))}), ` +
      `lowest ${heights[bottom]!.toFixed(1)} m at ${at(bottom)} m (${place(at(bottom))})`,
  );
  console.log(
    `  steepest over ${GRADIENT_RUN} m: up ${pct(grades[up]!)} from ${at(up)} m (${place(at(up))}), ` +
      `down ${pct(grades[down]!)} from ${at(down)} m (${place(at(down))})`,
  );
  console.log(
    `  line at ${heights[0]!.toFixed(1)} m; longest stretch under the land: ` +
      `${Math.round(under.length * profile.spacing)} m from ${at(under.from)} m (${place(at(under.from))})`,
  );

  // Height along the lap.
  const width = 1200;
  const height = 400;
  const pad = 20;
  const all = [...heights, ...land];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const canvas = new Canvas(width, height, [255, 255, 255]);
  const X = (i: number): number => pad + ((width - 2 * pad) * i) / (n - 1);
  const Y = (h: number): number => height - pad - ((height - 2 * pad) * (h - lo)) / (hi - lo);
  for (let h = Math.ceil(lo / 10) * 10; h <= hi; h += 10) {
    canvas.line(pad, Y(h), width - pad, Y(h), [230, 230, 230], 0);
  }
  for (const s of profile.sectorStarts) {
    const i = Math.round(s / profile.spacing);
    canvas.line(X(i), pad, X(i), height - pad, [230, 180, 0], 1);
  }
  for (let i = 1; i < n; i++) {
    canvas.line(X(i - 1), Y(land[i - 1]!), X(i), Y(land[i]!), [170, 170, 170], 1);
    canvas.line(X(i - 1), Y(heights[i - 1]!), X(i), Y(heights[i]!), [0, 0, 0], 1);
  }
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'preview');
  mkdirSync(dir, { recursive: true });
  canvas.save(join(dir, `${circuit.id}-elevation.png`));
}

/** The land around the track in game coordinates, for the ground the client draws (Phase 3d). */
function writeLand(): void {
  const profile = readJson<CircuitProfile>(profilePath(dataOf(circuit)));
  const terrain = readJson<RawTerrain>(terrainPath(dataOf(circuit)));
  const { stations } = generate(profile, circuit, circuit.scale, elevationOf(circuit, profile));
  const toReal = fromGame(profile, circuit, circuit.scale);
  const toOsm = profileToOsm(profile.osmFrame);
  const xs = stations.map(([x]) => x);
  const zs = stations.map(([, z]) => z);
  const minX = Math.floor((Math.min(...xs) - LAND_MARGIN) / LAND_CELL) * LAND_CELL;
  const minZ = Math.floor((Math.min(...zs) - LAND_MARGIN) / LAND_CELL) * LAND_CELL;
  const cols = Math.ceil((Math.max(...xs) + LAND_MARGIN - minX) / LAND_CELL) + 1;
  const rows = Math.ceil((Math.max(...zs) + LAND_MARGIN - minZ) / LAND_CELL) + 1;
  const heights: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ll = toOsm(toReal([minX + c * LAND_CELL, minZ + r * LAND_CELL]));
      const r0 = Math.floor((ll[0] - terrain.lat0) / terrain.dLat);
      const c0 = Math.floor((ll[1] - terrain.lon0) / terrain.dLon);
      // No land in any of the four DEM cells around: the sea.
      const cells = [0, 1].flatMap((i) =>
        [0, 1].map((j) => terrain.heights[(r0 + i) * terrain.cols + c0 + j]),
      );
      const sea = cells.every((h) => h === null || h === undefined);
      heights.push(sea ? SEA_FLOOR : Math.round((landHeight(terrain, ll) ?? SEA_FLOOR) * 10) / 10);
    }
  }
  const bare = openGround(heights, cols, rows, Math.round(BARE_RADIUS / LAND_CELL));
  const lines = [
    `// Generated by 01_tools/openf1/terrain.ts from EU-DEM 25 m (Copernicus, via OpenTopoData) — do not`,
    `// edit by hand: re-run the tool (see 01_docs/elevation.md).`,
    ``,
    `/**`,
    ` * ${circuit.name}'s land around the track (m above sea level, real; ${SEA_FLOOR} under the sea; roofs taken`,
    ` * away by an opening of ${BARE_RADIUS} m, the DEM being a surface model), on a`,
    ` * grid in game coordinates: \`heights[row * cols + col]\` at (minX + col · cell, minZ + row · cell).`,
    ` */`,
    `export const ${circuit.constName}_LAND = {`,
    `  minX: ${minX},`,
    `  minZ: ${minZ},`,
    `  cell: ${LAND_CELL},`,
    `  cols: ${cols},`,
    `  rows: ${rows},`,
    `  heights: [${bare.join(', ')}],`,
    `} as const;`,
    ``,
  ];
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    `../../01_packages/client/src/view/themes/${circuit.id}Land.ts`,
  );
  writeFileSync(file, lines.join('\n'));
  console.log(`  land: ${cols} × ${rows} heights, ${LAND_CELL} m apart, written for the client`);
}

/**
 * Morphological opening of the land (sea cells left as they are and never counted): the lowest
 * height within `radius` cells, then the highest of those lows. Bare ground from a surface model.
 */
function openGround(
  heights: readonly number[],
  cols: number,
  rows: number,
  radius: number,
): number[] {
  const sea = (i: number): boolean => heights[i]! <= SEA_FLOOR;
  const pass = (values: readonly number[], pick: (a: number, b: number) => number): number[] =>
    values.map((v, i) => {
      if (sea(i)) return v;
      const r = Math.floor(i / cols);
      const c = i % cols;
      let out = v;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dr * dr + dc * dc > radius * radius) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          const j = rr * cols + cc;
          if (!sea(j)) out = pick(out, values[j]!);
        }
      }
      return out;
    });
  return pass(pass(heights, Math.min), Math.max).map((h) => Math.round(h * 10) / 10);
}
