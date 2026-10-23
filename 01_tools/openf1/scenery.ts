/**
 * A circuit's scenery from OpenStreetMap: grandstands, pit lane and pit buildings, woods and old
 * raceways (e.g. Monza's oval). Downloads them (`--fetch`) into `data/<id>.scenery.json`
 * (committed), then writes the game's plain-data layout
 * `01_packages/client/src/view/themes/<id>Layout.ts` (generated: never edit by hand).
 * Usage: node --import ./01_tools/openf1/resolveTs.ts 01_tools/openf1/scenery.ts <id> [--fetch]
 * Method and placement rules: 01_docs/themes.md.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrack, locateOnTrack, vec2 } from '../../01_packages/shared/src/index.ts';
import { circuitById } from './circuits.ts';
import { generate, toGame, widthAt } from './generate.ts';
import type { Point } from './geometry.ts';
import {
  osmPath,
  osmToProfile,
  profilePath,
  readJson,
  sceneryPath,
  type CircuitProfile,
  type RawOsmCircuit,
  type RawScenery,
  type SceneryFeature,
} from './openf1.ts';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
/** Area searched around the circuit (degrees). */
const MARGIN = 0.008;
/** Buildings further than this from the circuit are town, not circuit (m). */
const BUILDING_REACH = 250;

/** Grandstands and buildings further than this beyond the real asphalt are left out (m, real). */
const MAX_REACH = 250;
/** Grandstands shorter than this are left out (m, real): kiosks, camera towers. */
const MIN_STAND = 12;
/** Props never stand closer than this beyond the game's wall (m). */
const MIN_GAP = 3;
/** Pit lane: width (m, real), and the pit wall between it and the track's wall (m, game). */
const PIT_LANE_WIDTH = 12;
const PIT_WALL = 1;
/** Pit buildings: within this distance of the pit lane (m, real). */
const PIT_REACH = 80;
/** A footprint's points are located within this distance along the lap of its centre (m, real). */
const FOOTPRINT_REACH = 200;
/** Old raceways kept as scenery, by name (Monza's high-speed oval). */
const OVAL = /sopraelevata|anello alta velocit/i;
/** Oval: deck height over the GP track (m), length of the ramps either side (m), max bank (rad). */
const BRIDGE_HEIGHT = 8;
/** Oval: deck width (m, real). */
const OVAL_WIDTH = 12;
const RAMP = 70;
const MAX_BANK = 0.45;

const circuit = circuitById(process.argv[2] ?? '');
if (process.argv.includes('--fetch') || !existsSync(sceneryPath(circuit.id))) {
  await fetchScenery();
}
writeLayout();

async function fetchScenery(): Promise<void> {
  const track = readJson<RawOsmCircuit>(osmPath(circuit.id));
  const lats = track.ways.flat().map(([lat]) => lat);
  const lons = track.ways.flat().map(([, lon]) => lon);
  const bbox = [
    Math.min(...lats) - MARGIN,
    Math.min(...lons) - MARGIN,
    Math.max(...lats) + MARGIN,
    Math.max(...lons) + MARGIN,
  ].join(',');
  const query = `[out:json][timeout:120];
(
  relation(${circuit.osmRelation});
  way["building"](${bbox});
  way["landuse"="forest"](${bbox});
  way["natural"="wood"](${bbox});
  way["highway"="raceway"](${bbox});
);
out geom;`;
  const response = await fetch(OVERPASS, {
    method: 'POST',
    // Overpass refuses requests without a user agent.
    headers: {
      'User-Agent': 'AltF1-Racing track tool',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) throw new Error(`Overpass: HTTP ${response.status}`);
  interface Element {
    readonly type: string;
    readonly id: number;
    readonly tags?: Record<string, string>;
    readonly geometry?: readonly { readonly lat: number; readonly lon: number }[];
    readonly members?: readonly {
      readonly type: string;
      readonly role: string;
      readonly geometry?: readonly { readonly lat: number; readonly lon: number }[];
    }[];
  }
  const { elements } = (await response.json()) as { elements: Element[] };
  const near = nearCircuit(track);
  const geometry = (g: readonly { lat: number; lon: number }[]): [number, number][] =>
    g.map((p) => [Math.round(p.lat * 1e7) / 1e7, Math.round(p.lon * 1e7) / 1e7]);
  const features: SceneryFeature[] = [];
  for (const e of elements) {
    if (e.type === 'relation') {
      for (const m of e.members ?? []) {
        if (m.type === 'way' && m.role === 'pit_lane' && m.geometry) {
          features.push({ kind: 'pitLane', name: 'pit lane', points: geometry(m.geometry) });
        }
      }
      continue;
    }
    if (!e.geometry) continue;
    const tags = e.tags ?? {};
    const points = geometry(e.geometry);
    const name = tags.name ?? '';
    if (tags.building === 'grandstand') features.push({ kind: 'grandstand', name, points });
    else if (tags.building) {
      if (points.some(near)) features.push({ kind: 'building', name, points });
    } else if (tags.landuse === 'forest' || tags.natural === 'wood') {
      features.push({ kind: 'wood', name, points });
    } else if (tags.highway === 'raceway') {
      features.push({ kind: 'raceway', name, points });
    }
  }
  const raw: RawScenery = {
    attribution: '© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)',
    bbox,
    features,
  };
  writeFileSync(sceneryPath(circuit.id), JSON.stringify(raw) + '\n');
  const count = (kind: string): number => features.filter((f) => f.kind === kind).length;
  console.log(
    `${circuit.name}: ${count('grandstand')} grandstands, ${count('building')} buildings, ` +
      `${count('pitLane')} pit lane ways, ${count('wood')} woods, ${count('raceway')} raceway ways`,
  );
}

/** True for [lat, lon] points within BUILDING_REACH of the circuit's centreline. */
function nearCircuit(track: RawOsmCircuit): (p: readonly [number, number]) => boolean {
  const nodes = track.ways.flat();
  const metresPerLon = 111320 * Math.cos((nodes[0]![0] * Math.PI) / 180);
  return ([lat, lon]) =>
    nodes.some(
      ([la, lo]) => Math.hypot((lat - la) * 110574, (lon - lo) * metresPerLon) < BUILDING_REACH,
    );
}

/** A track-relative point: lap fraction and metres beyond the game's wall (+ right, − left). */
type Spot = [number, number];

function writeLayout(): void {
  const profile = readJson<CircuitProfile>(profilePath(circuit.id));
  const raw = readJson<RawScenery>(sceneryPath(circuit.id));
  const toProfile = osmToProfile(profile.osmFrame);
  const toWorld = toGame(profile, circuit, circuit.scale);
  const track = buildTrack(generate(profile, circuit, circuit.scale).definition);
  const stations = profile.stations;
  const n = stations.length;

  /**
   * Lap fraction, signed lateral offset and gap beyond the real asphalt of a real point; with
   * `around`, only the stations within FOOTPRINT_REACH of that one are searched.
   */
  const relative = (p: Point, around?: number) => {
    let best = 0;
    let bestDistance = Infinity;
    const window = Math.round(FOOTPRINT_REACH / profile.spacing);
    stations.forEach(([x, y], i) => {
      if (around !== undefined && Math.abs(wrappedIndex(i - around, n)) > window) return;
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    const [ax, ay] = stations[(best - 1 + n) % n]!;
    const [bx, by] = stations[(best + 1) % n]!;
    const len = Math.hypot(bx - ax, by - ay);
    // Right of the driving direction, y north.
    const lateral =
      ((p[0] - stations[best]![0]) * (by - ay) - (p[1] - stations[best]![1]) * (bx - ax)) / len;
    const half = widthAt(circuit.widths, best * profile.spacing, profile.length) / 2;
    return { index: best, at: best / n, lateral, edgeGap: Math.abs(lateral) - half };
  };

  /**
   * Real points → track spots, all moved out by the same amount so the nearest is at least `minGap`
   * beyond the game's wall (the game's asphalt and run-off are wider than the real ones); null when
   * it straddles the track or lands near another stretch of it. Every point is located near the
   * footprint's centre: a corner can't jump to another part of the lap that passes close behind it.
   */
  const place = (points: readonly Point[], minGap: number): Spot[] | null => {
    const centre: Point = [
      points.reduce((sum, p) => sum + p[0], 0) / points.length,
      points.reduce((sum, p) => sum + p[1], 0) / points.length,
    ];
    const around = relative(centre).index;
    const rel = points.map((p) => relative(p, around));
    const side = Math.sign(rel[0]!.lateral);
    if (rel.some((r) => Math.sign(r.lateral) !== side)) return null; // straddles the track
    const gaps = rel.map((r) => r.edgeGap * circuit.scale - circuit.runoffWidth);
    const shift = Math.max(0, minGap - Math.min(...gaps));
    const spots = rel.map((r, i): Spot => [round(r.at, 5), round(side * (gaps[i]! + shift))]);
    return spots.every((spot) => clearOfWalls(spot, minGap)) ? spots : null;
  };
  /**
   * False when a spot lands closer than `minGap` to another stretch of the game's track: wider than
   * the real one, it can swallow the room between two real stretches (e.g. a building between them).
   */
  const clearOfWalls = ([at, gap]: Spot, minGap: number): boolean => {
    const samples = track.samples;
    const s = samples[Math.round(at * samples.length) % samples.length]!;
    const offset = Math.sign(gap) * (s.halfWidth + track.runoffWidth + Math.abs(gap));
    const p = vec2(s.position.x + s.normal.x * offset, s.position.z + s.normal.z * offset);
    const loc = locateOnTrack(track, p);
    // 1 m of slack: spots are rounded and located on the nearest sample.
    return Math.abs(loc.lateral) - loc.halfWidth - track.runoffWidth > minGap - 1;
  };
  const real = (f: SceneryFeature): Point[] => f.points.map((p) => toProfile(p));
  const length = (ps: readonly Point[]): number =>
    ps.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - ps[i]![0], p[1] - ps[i]![1]), 0);

  // Pit lane and the buildings along it, moved out together past the pit wall.
  // Its ways (entry, lane, exit) joined into one line, in the driving direction.
  const laneLine = chain(raw.features.filter((f) => f.kind === 'pitLane').map(real)).reduce(
    (longest, line) => (line.length > longest.length ? line : longest),
  );
  const wrapped = (d: number): number => (((d % 1) + 1.5) % 1) - 0.5;
  const laneAt = laneLine.map((p) => relative(p).at);
  const forward = laneAt.slice(1).reduce((sum, at, i) => sum + wrapped(at - laneAt[i]!), 0) > 0;
  const laneReal = forward ? laneLine : [...laneLine].reverse();
  const laneRel = laneReal.map((p) => relative(p));
  const laneSide = Math.sign(laneRel.reduce((sum, r) => sum + r.lateral, 0));
  const laneHalf = (PIT_LANE_WIDTH * circuit.scale) / 2;
  const laneGaps = laneRel.map((r) => Math.max(0, r.edgeGap) * circuit.scale - circuit.runoffWidth);
  const laneShift = PIT_WALL + laneHalf - Math.min(...laneGaps);
  const pitLane: Spot[] = laneRel.map((r, i) => [
    round(r.at, 5),
    round(laneSide * (laneGaps[i]! + laneShift)),
  ]);
  // Everything beside the lane stands beyond its outer edge (it's further out mid-straight).
  const laneOuter = Math.max(...pitLane.map(([, gap]) => Math.abs(gap))) + laneHalf;
  const laneAts = laneRel.map((r) => r.at);
  const laneWraps = Math.max(...laneAts) - Math.min(...laneAts) > 0.5; // over the start line
  const inLaneSpan = (at: number): boolean => {
    const margin = 0.01;
    if (!laneWraps) {
      return at >= Math.min(...laneAts) - margin && at <= Math.max(...laneAts) + margin;
    }
    const from = Math.min(...laneAts.filter((a) => a >= 0.5));
    const to = Math.max(...laneAts.filter((a) => a < 0.5));
    return at >= from - margin || at <= to + margin;
  };
  const nearLane = (p: Point): boolean =>
    laneReal.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < PIT_REACH);
  const pitBuildings = raw.features
    .filter((f) => f.kind === 'building')
    .map(real)
    .filter((ps) => ps.every(nearLane) && length(ps) / 2 >= MIN_STAND)
    .map((ps) => place(ps, laneOuter + 2))
    .filter((spots): spots is Spot[] => spots !== null && Math.sign(spots[0]![1]) === laneSide);

  // Grandstands: real footprints beside the track; on the pit side, beyond the pit lane.
  const besideLane = (ps: readonly Point[]): boolean =>
    ps.map((p) => relative(p)).some((r) => Math.sign(r.lateral) === laneSide && inLaneSpan(r.at));
  const stands = raw.features
    .filter((f) => f.kind === 'grandstand')
    .map((f) => ({ name: f.name || 'Tribuna', points: real(f) }))
    .filter((f) => length(f.points) / 2 >= MIN_STAND)
    .filter((f) => Math.min(...f.points.map((p) => relative(p).edgeGap)) < MAX_REACH)
    .map((f) => ({
      name: f.name,
      footprint: place(f.points, besideLane(f.points) ? laneOuter + 2 : MIN_GAP),
    }))
    .filter((f): f is { name: string; footprint: Spot[] } => f.footprint !== null);

  // Woods: absolute, in game coordinates.
  const woods = raw.features
    .filter((f) => f.kind === 'wood' && f.points.length >= 4)
    .map((f) => f.points.map((p) => toWorld(toProfile(p))));

  const oval = ovalPieces(
    raw.features
      .filter((f) => f.kind === 'raceway' && OVAL.test(f.name))
      .map((f) => f.points.map((p) => toWorld(toProfile(p)))),
    track,
    (OVAL_WIDTH * circuit.scale) / 2,
  );

  const pt = ([x, z]: readonly number[]): string => `vec2(${round(x!)}, ${round(z!)})`;
  const spots = (list: readonly Spot[]): string =>
    `[${list.map(([a, g]) => `[${a}, ${g}]`).join(', ')}]`;
  const lines = [
    `// Generated by 01_tools/openf1/scenery.ts from OpenStreetMap (© OpenStreetMap contributors, ODbL)`,
    `// — do not edit by hand: change the tool and re-run it (see 01_docs/themes.md).`,
    `import { vec2, type Vec2 } from '@altf1/shared';`,
    `import type { TrackSpot } from '../scenery/placement';`,
    ``,
    `/** ${circuit.name}'s real grandstands (OSM \`building=grandstand\`): footprints beside the track. */`,
    `export const ${circuit.constName}_STANDS: readonly {`,
    `  readonly name: string;`,
    `  readonly footprint: readonly TrackSpot[];`,
    `}[] = [`,
    ...stands.map(
      (s) => `  { name: ${JSON.stringify(s.name)}, footprint: ${spots(s.footprint)} },`,
    ),
    `];`,
    ``,
    `/** Pit lane centreline (decorative: behind the wall; drivable later), ${round(2 * laneHalf)} m wide. */`,
    `export const ${circuit.constName}_PIT_LANE: { readonly width: number; readonly path: readonly TrackSpot[] } = {`,
    `  width: ${round(2 * laneHalf)},`,
    `  path: ${spots(pitLane)},`,
    `};`,
    ``,
    `/** Pit buildings and garages along the pit lane: footprints. */`,
    `export const ${circuit.constName}_PIT_BUILDINGS: readonly (readonly TrackSpot[])[] = [`,
    ...pitBuildings.map((b) => `  ${spots(b)},`),
    `];`,
    ``,
    `/** Woods (OSM forest/wood): polygons on the ground. */`,
    `export const ${circuit.constName}_WOODS: readonly (readonly Vec2[])[] = [`,
    ...woods.map((w) => `  [${w.map(pt).join(', ')}],`),
    `];`,
    ``,
    `/**`,
    ` * The old high-speed oval: pieces of its centreline with the deck height (bridges over the GP`,
    ` * track) and bank angle (rad, the curve's outside raised) at each point; deck width in m.`,
    ` */`,
    `export const ${circuit.constName}_OVAL_WIDTH = ${round(OVAL_WIDTH * circuit.scale)};`,
    ``,
    `export const ${circuit.constName}_OVAL: readonly {`,
    `  readonly points: readonly Vec2[];`,
    `  readonly height: readonly number[];`,
    `  readonly bank: readonly number[];`,
    `}[] = [`,
    ...oval.map(
      (o) =>
        `  {\n    points: [${o.points.map(pt).join(', ')}],\n    height: [${o.height.map((h) => round(h)).join(', ')}],\n    bank: [${o.bank.map((b) => round(b, 3)).join(', ')}],\n  },`,
    ),
    `];`,
    ``,
  ];
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    `../../01_packages/client/src/view/themes/${circuit.id}Layout.ts`,
  );
  writeFileSync(file, lines.join('\n'));
  console.log(
    `${circuit.name} layout: ${stands.length} stands, pit lane ${pitLane.length} points ` +
      `(${laneSide > 0 ? 'right' : 'left'}), ${pitBuildings.length} pit buildings, ` +
      `${woods.length} woods, oval in ${oval.length} pieces`,
  );
}

/**
 * Chains the oval's ways into lines, then keeps them as scenery: dropped where they run along the GP
 * track (shared straights), raised on a bridge where they cross it, banked in the curves.
 */
function ovalPieces(ways: Point[][], track: ReturnType<typeof buildTrack>, halfDeck: number) {
  const lines = chain(ways).map((line) => resample(line, 5));
  const pieces: { points: Point[]; height: number[]; bank: number[] }[] = [];
  for (const line of lines) {
    const inside = line.map(([x, z]) => {
      const loc = locateOnTrack(track, vec2(x, z));
      return Math.abs(loc.lateral) < loc.halfWidth + track.runoffWidth + 4 ? loc : null;
    });
    // Along the track (shared) or across it (bridge)?
    const along = line.map((p, i) => {
      const loc = inside[i];
      if (!loc) return false;
      const q = line[Math.min(i + 1, line.length - 1)]!;
      const r = line[Math.max(i - 1, 0)]!;
      const dx = q[0] - r[0];
      const dz = q[1] - r[1];
      const cos = Math.abs(dx * loc.tangent.x + dz * loc.tangent.z) / Math.hypot(dx, dz);
      return cos > Math.cos((25 * Math.PI) / 180);
    });
    const crossing = line.map((_, i) => inside[i] !== null && !along[i]);
    const step = 5;
    const height = line.map((_, i) => {
      let nearest = Infinity;
      crossing.forEach((c, j) => {
        if (c) nearest = Math.min(nearest, Math.abs(i - j) * step);
      });
      return nearest === Infinity
        ? 0
        : BRIDGE_HEIGHT * Math.max(0, Math.min(1, 1 - (nearest - 20) / RAMP));
    });
    const bank = line.map((_, i) => {
      const a = line[Math.max(i - 4, 0)]!;
      const b = line[i]!;
      const c = line[Math.min(i + 4, line.length - 1)]!;
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
      const curvature = ab * bc * ca === 0 ? 0 : (2 * cross) / (ab * bc * ca);
      return Math.min(MAX_BANK, Math.abs(curvature) * 150);
    });
    // Split where the oval runs along the GP track (that stretch is the track itself) and where,
    // on the ground, its deck would touch the GP track's walls.
    const touches = line.map(([x, z], i) => {
      if (height[i]! > 1) return false;
      const loc = locateOnTrack(track, vec2(x, z));
      return Math.abs(loc.lateral) < loc.halfWidth + track.runoffWidth + halfDeck + 2;
    });
    let current: { points: Point[]; height: number[]; bank: number[] } | null = null;
    line.forEach((p, i) => {
      if (along[i] || touches[i]) {
        current = null;
        return;
      }
      if (!current) {
        current = { points: [], height: [], bank: [] };
        pieces.push(current);
      }
      current.points.push(p);
      current.height.push(height[i]!);
      current.bank.push(bank[i]!);
    });
  }
  return pieces.filter((p) => p.points.length >= 4);
}

/** Joins ways sharing end points (within 3 m) into continuous lines. */
function chain(ways: Point[][]): Point[][] {
  const rest = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const lines: Point[][] = [];
  const close = (a: Point, b: Point): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 3;
  while (rest.length > 0) {
    let line = rest.shift()!;
    for (let grown = true; grown;) {
      grown = false;
      for (let i = 0; i < rest.length; i++) {
        const w = rest[i]!;
        const end = line[line.length - 1]!;
        const start = line[0]!;
        if (close(end, w[0]!)) line = [...line, ...w.slice(1)];
        else if (close(end, w[w.length - 1]!)) line = [...line, ...[...w].reverse().slice(1)];
        else if (close(start, w[w.length - 1]!)) line = [...w.slice(0, -1), ...line];
        else if (close(start, w[0]!)) line = [...[...w].reverse().slice(0, -1), ...line];
        else continue;
        rest.splice(i, 1);
        grown = true;
        break;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Points every `step` m along an open polyline. */
function resample(line: readonly Point[], step: number): Point[] {
  const out: Point[] = [line[0]!];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let at = step - carry;
    while (at <= len) {
      out.push([a[0] + ((b[0] - a[0]) * at) / len, a[1] + ((b[1] - a[1]) * at) / len]);
      at += step;
    }
    carry = len - (at - step);
  }
  return out;
}

/** A station index difference brought into (-n/2, n/2]: the short way round the lap. */
function wrappedIndex(d: number, n: number): number {
  return (((d % n) + n + n / 2) % n) - n / 2;
}

function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
