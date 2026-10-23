/**
 * A circuit's scenery from OpenStreetMap: grandstands, pit lane and pit buildings, woods and old
 * raceways (e.g. Monza's oval); on a town circuit also every building with its height, the sea,
 * piers, pools, trees and the tunnel (Monaco). Downloads them (`--fetch`) into `data/<id>.scenery.json`
 * (committed), then writes the game's plain-data layout
 * `01_packages/client/src/view/themes/<id>Layout.ts` (generated: never edit by hand).
 * Usage: node --import ./01_tools/openf1/resolveTs.ts 01_tools/openf1/scenery.ts <id> [--fetch]
 * Method and placement rules: 01_docs/themes.md.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrack, locateOnTrack, vec2, type Track } from '../../01_packages/shared/src/index.ts';
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
/** Town circuits: area searched for the town layers (degrees), metres per building level. */
const TOWN_MARGIN = 0.003;
const LEVEL_HEIGHT = 3.2;
/** Town building height by type when OSM has none (m). */
const TYPE_HEIGHT: Readonly<Record<string, number>> = {
  house: 8,
  detached: 8,
  roof: 4,
  garage: 4,
  kiosk: 3,
  chapel: 10,
  church: 16,
  cathedral: 25,
};
const TOWN_HEIGHT = 18;

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
/** Each pit lane point is located within this (plus the step) along the lap of the previous one (m, real). */
const LANE_FOLLOW = 60;
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
/** Town: buildings within this of the centreline (m, game), and their least gap beyond the wall. */
const CITY_REACH = 200;
const CITY_GAP = 1.5;
/** Town: footprints simplified to this tolerance (m). */
const SIMPLIFY = 0.5;
/** Tunnel: height of its roof's top, where the buildings over it stand (m). */
const TUNNEL_TOP = 8;
/** Town: the sea is drawn this far around the track (m, game) and kept this far beyond the wall. */
const SEA_REACH = 700;
const SEA_GAP = 2;
/** Town: piers and pools at least this far beyond the wall, trees at least this far (m). */
const WATERSIDE_GAP = 1;
const TREE_GAP = 4;
/** Town: the pit garages, temporary boxes beside the pit lane (m, real): depth, length, ends left out. */
const GARAGE_DEPTH = 10;
const GARAGE_CHUNK = 60;
const GARAGE_ENDS = 0.15;

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
  const town = circuit.town
    ? (() => {
        const b = [
          Math.min(...lats) - TOWN_MARGIN,
          Math.min(...lons) - TOWN_MARGIN,
          Math.max(...lats) + TOWN_MARGIN,
          Math.max(...lons) + TOWN_MARGIN,
        ].join(',');
        return `
  relation["building"](${b});
  way["natural"="coastline"](${b});
  way["man_made"="pier"](${b});
  way["leisure"="swimming_pool"](${b});
  node["natural"="tree"](${b});
  way(r.circuit)["tunnel"];`;
      })()
    : '';
  const query = `[out:json][timeout:180];
relation(${circuit.osmRelation})->.circuit;
(
  .circuit;
  way["building"](${bbox});
  way["landuse"="forest"](${bbox});
  way["natural"="wood"](${bbox});
  way["highway"="raceway"](${bbox});${town}
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
    readonly lat?: number;
    readonly lon?: number;
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
    const tags = e.tags ?? {};
    const name = tags.name ?? '';
    if (e.type === 'node') {
      if (e.lat !== undefined && e.lon !== undefined) {
        const points = geometry([{ lat: e.lat, lon: e.lon }]);
        if (points.some(near)) features.push({ kind: 'tree', name, points });
      }
      continue;
    }
    if (e.type === 'relation') {
      if (tags.building) {
        // A multipolygon building: its outer ring, joined from its outer ways.
        const outer = (e.members ?? [])
          .filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry)
          .map((m) => geometry(m.geometry!));
        const ring = joinRing(outer);
        if (ring && ring.some(near)) {
          features.push({ kind: 'townBuilding', name, points: ring, height: heightOf(tags) });
        }
        continue;
      }
      for (const m of e.members ?? []) {
        if (m.type === 'way' && m.role === 'pit_lane' && m.geometry) {
          features.push({ kind: 'pitLane', name: 'pit lane', points: geometry(m.geometry) });
        }
      }
      continue;
    }
    if (!e.geometry) continue;
    const points = geometry(e.geometry);
    if (circuit.town && tags.tunnel && tags.highway) {
      features.push({ kind: 'tunnel', name, points });
    } else if (tags.building === 'grandstand') features.push({ kind: 'grandstand', name, points });
    else if (tags.building) {
      if (!points.some(near)) continue;
      if (circuit.town) {
        features.push({ kind: 'townBuilding', name, points, height: heightOf(tags) });
      } else features.push({ kind: 'building', name, points });
    } else if (tags.natural === 'coastline') features.push({ kind: 'coastline', name, points });
    else if (tags.man_made === 'pier') features.push({ kind: 'pier', name, points });
    else if (tags.leisure === 'swimming_pool') features.push({ kind: 'pool', name, points });
    else if (tags.landuse === 'forest' || tags.natural === 'wood') {
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
      `${count('pitLane')} pit lane ways, ${count('wood')} woods, ${count('raceway')} raceway ways` +
      (circuit.town
        ? `; town: ${count('townBuilding')} buildings, ${count('coastline')} coastline ways, ` +
          `${count('pier')} piers, ${count('pool')} pools, ${count('tree')} trees, ` +
          `${count('tunnel')} tunnel ways`
        : ''),
  );
}

/** A town building's height (m): OSM `height`, else its levels, else a guess from its type. */
function heightOf(tags: Record<string, string>): number {
  const height = parseFloat(tags.height ?? '');
  if (height > 0) return height;
  const levels = parseFloat(tags['building:levels'] ?? '');
  if (levels > 0) return levels * LEVEL_HEIGHT + 1;
  return TYPE_HEIGHT[tags.building ?? ''] ?? TOWN_HEIGHT;
}

/** Joins ways sharing end nodes into one closed ring (null if they don't close). */
function joinRing(ways: readonly [number, number][][]): [number, number][] | null {
  if (ways.length === 0) return null;
  const same = (a: readonly number[], b: readonly number[]): boolean =>
    a[0] === b[0] && a[1] === b[1];
  const rest = ways.slice(1).map((w) => [...w]);
  let ring = [...ways[0]!];
  while (!same(ring[0]!, ring[ring.length - 1]!)) {
    const end = ring[ring.length - 1]!;
    const i = rest.findIndex((w) => same(w[0]!, end) || same(w[w.length - 1]!, end));
    if (i < 0) return null;
    const w = rest.splice(i, 1)[0]!;
    ring = [...ring, ...(same(w[0]!, end) ? w : [...w].reverse()).slice(1)];
  }
  return ring;
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
   * `around`, only the stations within `reach` m of that one are searched.
   */
  const relative = (p: Point, around?: number, reach = FOOTPRINT_REACH) => {
    let best = 0;
    let bestDistance = Infinity;
    const window = Math.round(reach / profile.spacing);
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
  const clearOfWalls = (spot: Spot, minGap: number): boolean =>
    // 1 m of slack: spots are rounded and located on the nearest sample.
    clearance(track, fromSpot(track, spot)) > minGap - 1;
  const real = (f: SceneryFeature): Point[] => f.points.map((p) => toProfile(p));
  const length = (ps: readonly Point[]): number =>
    ps.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - ps[i]![0], p[1] - ps[i]![1]), 0);

  // Pit lane and the buildings along it, moved out together past the pit wall.
  // Its ways (entry, lane, exit) joined into one line, in the driving direction.
  const laneLine = chain(raw.features.filter((f) => f.kind === 'pitLane').map(real)).reduce(
    (longest, line) => (line.length > longest.length ? line : longest),
  );
  const wrapped = (d: number): number => (((d % 1) + 1.5) % 1) - 0.5;
  // Each point located near the previous one's station: the lane follows one stretch even where
  // another runs close on its other side (Monaco's pits, between the start straight and the Piscine).
  const follow = (ps: readonly Point[]) => {
    const out: ReturnType<typeof relative>[] = [];
    ps.forEach((p, i) => {
      if (i === 0) return out.push(relative(p));
      const step = Math.hypot(p[0] - ps[i - 1]![0], p[1] - ps[i - 1]![1]);
      return out.push(relative(p, out[i - 1]!.index, LANE_FOLLOW + step));
    });
    return out;
  };
  const laneAt = follow(laneLine).map((r) => r.at);
  const forward = laneAt.slice(1).reduce((sum, at, i) => sum + wrapped(at - laneAt[i]!), 0) > 0;
  const ordered = forward ? laneLine : [...laneLine].reverse();
  // Points running back along the lap (a spur into the garages) are left out.
  const orderedRel = follow(ordered);
  const keep = orderedRel.map(() => true);
  let last = orderedRel[0]!.at;
  orderedRel.forEach((r, i) => {
    if (i > 0 && wrapped(r.at - last) < -0.002) keep[i] = false;
    else last = r.at;
  });
  const laneReal = ordered.filter((_, i) => keep[i]);
  const laneRel = orderedRel.filter((_, i) => keep[i]);
  const laneSide = Math.sign(laneRel.reduce((sum, r) => sum + r.lateral, 0));
  const laneHalf = (PIT_LANE_WIDTH * circuit.scale) / 2;
  const laneGaps = laneRel.map((r) => Math.max(0, r.edgeGap) * circuit.scale - circuit.runoffWidth);
  const laneShift = PIT_WALL + laneHalf - Math.min(...laneGaps);
  // The longest run that really is beyond the wall, points and the way between them: past a tight
  // corner an offset along the normal can land on another stretch, and where the real lane cuts a
  // corner the wider game track leaves it no room (Monaco's, from La Rascasse by the Piscine).
  const laneSpots = laneRel.map((r, i): Spot => [
    round(r.at, 5),
    round(laneSide * (laneGaps[i]! + laneShift)),
  ]);
  const laneClear = (spot: Spot): boolean => clearOfWalls(spot, PIT_WALL + laneHalf);
  const pitLane = longestRun(
    laneSpots,
    (a, b) => {
      if (!laneClear(b)) return false;
      const dAt = wrapped(b[0] - a[0]);
      for (let f = 0.25; f < 1; f += 0.25) {
        if (!laneClear([a[0] + dAt * f, a[1] + (b[1] - a[1]) * f])) return false;
      }
      return true;
    },
    (a, b) => Math.abs(wrapped(b[0] - a[0])),
  ).filter((spot, i, run) => i > 0 || laneClear(spot) || run.length === 1);
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
  const pitBuildings = circuit.town
    ? garageRow(
        pitLane,
        profile.length,
        laneHalf + 1,
        laneSide * GARAGE_DEPTH * circuit.scale,
        (box) => box.every((spot) => clearOfWalls(spot, MIN_GAP)),
      )
    : raw.features
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
  // Hand-placed ones (temporary stands are not in OSM), by the same rules.
  for (const hand of circuit.stands ?? []) {
    const index = Math.round(hand.at / profile.spacing);
    const side = hand.side === 'right' ? 1 : -1;
    const from = (index - hand.length / 2 / profile.spacing) / n;
    const to = (index + hand.length / 2 / profile.spacing) / n;
    const lane = side === laneSide && inLaneSpan(index / n);
    const near = lane ? laneOuter + 2 : MIN_GAP;
    const far = near + hand.depth * circuit.scale;
    const lap = (a: number): number => round((a + 1) % 1, 5);
    const footprint: Spot[] = [
      [lap(from), side * near],
      [lap(to), side * near],
      [lap(to), side * far],
      [lap(from), side * far],
      [lap(from), side * near],
    ];
    if (!footprint.every((spot) => clearOfWalls(spot, near))) {
      throw new Error(`${hand.name}: no room there`);
    }
    stands.push({ name: hand.name, footprint });
  }

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

  const town = circuit.town
    ? townLayers(
        raw,
        track,
        (p) => toWorld(toProfile(p)),
        [...stands.map((st) => st.footprint), ...pitBuildings, pitLane].map((f) =>
          f.map((spot) => fromSpot(track, spot)),
        ),
        (PIT_LANE_WIDTH * circuit.scale) / 2 + GARAGE_DEPTH * circuit.scale + 2,
        tunnelSpan(raw.features.filter((f) => f.kind === 'tunnel').flatMap(real), relative),
      )
    : null;

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
    ...(town ? townLines(circuit.constName, town, pt) : []),
  ];
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    `../../01_packages/client/src/view/themes/${circuit.id}Layout.ts`,
  );
  writeFileSync(file, lines.join('\n'));
  console.log(
    `${circuit.name} layout: ${stands.length} stands, pit lane ${pitLane.length} points ` +
      `(${laneSide > 0 ? 'right' : 'left'}), ${pitBuildings.length} pit buildings, ` +
      `${woods.length} woods, oval in ${oval.length} pieces` +
      (town
        ? `; town: ${town.city.length} buildings (${town.city.filter((b) => b.base > 0).length} ` +
          `over the tunnel), ${town.sea.length} sea and ${town.islands.length} island polygons, ` +
          `${town.piers.length} piers, ${town.pools.length} pools, ${town.palms.length} palms, ` +
          `tunnel ${town.tunnel ? `${town.tunnel.from}–${town.tunnel.to}` : 'none'}`
        : ''),
  );
}

/**
 * The longest run of consecutive points where every step a → b is `ok` (b's own check included),
 * by the summed `step` lengths.
 */
function longestRun<T>(
  points: readonly T[],
  ok: (a: T, b: T) => boolean,
  step: (a: T, b: T) => number,
): T[] {
  let best: T[] = points.slice(0, 1);
  let bestLength = 0;
  let run: T[] = points.slice(0, 1);
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    if (ok(points[i - 1]!, points[i]!)) {
      run.push(points[i]!);
      length += step(points[i - 1]!, points[i]!);
    } else {
      run = [points[i]!];
      length = 0;
    }
    if (length > bestLength) {
      best = [...run];
      bestLength = length;
    }
  }
  return best;
}

/** Where a track spot is on the ground (as the client's `fromTrack`). */
function fromSpot(track: Track, [at, gap]: Spot): Point {
  const samples = track.samples;
  const s =
    samples[
      ((Math.round(at * samples.length) % samples.length) + samples.length) % samples.length
    ]!;
  const offset = Math.sign(gap) * (s.halfWidth + track.runoffWidth + Math.abs(gap));
  return [s.position.x + s.normal.x * offset, s.position.z + s.normal.z * offset];
}

/** Metres beyond the walls (negative: on the asphalt or the run-off). */
function clearance(track: Track, [x, z]: Point): number {
  const loc = locateOnTrack(track, vec2(x, z));
  return Math.abs(loc.lateral) - loc.halfWidth - track.runoffWidth;
}

/**
 * Town circuits: the pit garages as a row of boxes `depth` deep (signed: towards the pit side),
 * `beyond` the pit lane's centreline where it runs, over its middle (the ends are entry and exit);
 * shallower where another stretch of the track is close behind, left out where none `fits`.
 */
function garageRow(
  pitLane: readonly Spot[],
  lapLength: number,
  beyond: number,
  depth: number,
  fits: (box: Spot[]) => boolean,
): Spot[][] {
  const lap = (a: number): number => round(((a % 1) + 1) % 1, 5);
  const first = pitLane[0]![0];
  const span = (((pitLane[pitLane.length - 1]![0] - first) % 1) + 1) % 1;
  const from = first + span * GARAGE_ENDS;
  const to = first + span * (1 - GARAGE_ENDS);
  const side = Math.sign(depth);
  const ahead = (at: number): number => (((at - first) % 1) + 1) % 1;
  /** The lane's farthest gap from the wall between a and b (lap fractions from `first`). */
  const laneGap = (a: number, b: number): number => {
    const inside = pitLane.filter(([at]) => ahead(at) >= a - first && ahead(at) <= b - first);
    const pool = inside.length > 0 ? inside : pitLane;
    return Math.max(...pool.map(([, g]) => Math.abs(g)));
  };
  const chunk = GARAGE_CHUNK / lapLength;
  const boxes: Spot[][] = [];
  for (let a = from; a < to - 1e-9; a += chunk) {
    const b = Math.min(to, a + chunk);
    const lane = laneGap(a, b);
    // Beyond the lane, as deep as there is room for (down to a third).
    const near = lane + beyond;
    for (let k = 0; k < 3; k++) {
      const back = near + (Math.abs(depth) * (3 - k)) / 3;
      const box: Spot[] = [
        [lap(a), round(side * near)],
        [lap(b), round(side * near)],
        [lap(b), round(side * back)],
        [lap(a), round(side * back)],
        [lap(a), round(side * near)],
      ];
      if (fits(box)) {
        boxes.push(box);
        break;
      }
    }
  }
  return boxes;
}

/** The tunnel's lap fractions [from, to] (driving order), from its real points; null without one. */
function tunnelSpan(
  points: readonly Point[],
  relative: (p: Point) => { readonly at: number },
): { from: number; to: number } | null {
  if (points.length === 0) return null;
  const ats = points.map((p) => relative(p).at).sort((a, b) => a - b);
  // The span is the circle minus its widest gap between consecutive points.
  let gapAfter = ats.length - 1;
  let widest = ats[0]! + 1 - ats[ats.length - 1]!;
  for (let i = 0; i + 1 < ats.length; i++) {
    if (ats[i + 1]! - ats[i]! > widest) {
      widest = ats[i + 1]! - ats[i]!;
      gapAfter = i;
    }
  }
  return { from: round(ats[(gapAfter + 1) % ats.length]!, 5), to: round(ats[gapAfter]!, 5) };
}

interface Town {
  readonly city: { points: Point[]; height: number; base: number; name: string }[];
  readonly sea: Point[][];
  readonly islands: Point[][];
  readonly piers: { points: Point[]; area: boolean }[];
  readonly pools: Point[][];
  readonly palms: Point[];
  readonly tunnel: { from: number; to: number } | null;
}

/**
 * A town circuit's layers in game coordinates. Buildings within CITY_REACH, pushed out to CITY_GAP
 * beyond the wall (the street canyon stays); dropped where they straddle the track, except over
 * the tunnel (they stand on its roof) and where they'd stand on the stands, pits or pit lane
 * (`occupied` footprints, plus `laneReach` around their points). The sea from the coastline
 * (OSM: land on the left), kept SEA_GAP beyond the wall; piers, pools and trees clear of it.
 */
function townLayers(
  raw: RawScenery,
  track: Track,
  toWorld: (p: readonly [number, number]) => Point,
  occupied: readonly Point[][],
  laneReach: number,
  tunnel: { from: number; to: number } | null,
): Town {
  const world = (f: SceneryFeature): Point[] => f.points.map((p) => toWorld(p));
  const loc = ([x, z]: Point) => locateOnTrack(track, vec2(x, z));
  const inTunnel = (distance: number): boolean => {
    if (!tunnel) return false;
    const at = distance / track.length;
    return tunnel.from <= tunnel.to
      ? at >= tunnel.from && at <= tunnel.to
      : at >= tunnel.from || at <= tunnel.to;
  };
  /** Moves `p` out along the track's normal until it is `gap` beyond the wall. */
  const pushOut = (p: Point, gap: number): Point => {
    const l = loc(p);
    const missing = gap - (Math.abs(l.lateral) - l.halfWidth - track.runoffWidth);
    if (missing <= 0) return p;
    const s = Math.sign(l.lateral) || 1;
    // The normal: the tangent turned right.
    return [p[0] - l.tangent.z * s * missing, p[1] + l.tangent.x * s * missing];
  };
  const onOccupied = (p: Point): boolean =>
    occupied.some(
      (f) =>
        insidePolygon(p, f) || f.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < laneReach / 2),
    );

  const city: Town['city'] = [];
  for (const f of raw.features.filter((g) => g.kind === 'townBuilding')) {
    const ring = simplify(world(f).slice(0, -1), SIMPLIFY);
    if (ring.length < 3) continue;
    const locs = ring.map(loc);
    if (locs.every((l) => Math.abs(l.lateral) > CITY_REACH)) continue;
    if (ring.some(onOccupied)) continue;
    const near = locs.filter(
      (l) => Math.abs(l.lateral) - l.halfWidth - track.runoffWidth < CITY_GAP,
    );
    const straddles =
      near.length > 0 && locs.some((l) => Math.sign(l.lateral) !== Math.sign(near[0]!.lateral));
    if (straddles) {
      // Over the tunnel it stands on the roof (the Fairmont); elsewhere it would block the track.
      if (near.every((l) => inTunnel(l.distance))) {
        city.push({
          points: ring,
          height: f.height ?? TOWN_HEIGHT,
          base: TUNNEL_TOP,
          name: f.name,
        });
      }
      continue;
    }
    const pushed = ring.map((p) => pushOut(p, CITY_GAP));
    if (pushed.some((p) => clearance(track, p) < CITY_GAP - 0.5)) continue; // between two stretches
    city.push({ points: pushed, height: f.height ?? TOWN_HEIGHT, base: 0, name: f.name });
  }

  const bounds = trackBounds(track, SEA_REACH);
  const { sea, islands } = seaPolygons(
    chain(raw.features.filter((f) => f.kind === 'coastline').map(world)),
    bounds,
  );
  const keepOff = (ring: Point[]): Point[] => resample(ring, 5).map((p) => pushOut(p, SEA_GAP));

  const clearBy =
    (gap: number) =>
    (ps: readonly Point[]): boolean =>
      ps.every((p) => clearance(track, p) >= gap);
  const piers = raw.features
    .filter((f) => f.kind === 'pier')
    .map((f) => {
      const points = world(f);
      const area =
        points.length > 3 &&
        f.points[0]![0] === f.points[f.points.length - 1]![0] &&
        f.points[0]![1] === f.points[f.points.length - 1]![1];
      return { points: area ? points.slice(0, -1) : points, area };
    })
    .filter((pier) => clearBy(WATERSIDE_GAP)(pier.points));
  const pools = raw.features
    .filter((f) => f.kind === 'pool' && f.points.length > 3)
    .map((f) => world(f).slice(0, -1))
    .filter(clearBy(WATERSIDE_GAP));
  const palms = raw.features
    .filter((f) => f.kind === 'tree')
    .map((f) => world(f)[0]!)
    .filter((p) => clearance(track, p) >= TREE_GAP)
    .filter((p) => !city.some((b) => insidePolygon(p, b.points)));

  return {
    city,
    sea: sea.map(keepOff),
    islands,
    piers,
    pools,
    palms,
    tunnel,
  };
}

/** The town's generated exports (see `townLayers`). */
function townLines(constName: string, town: Town, pt: (p: readonly number[]) => string): string[] {
  const poly = (ps: readonly Point[]): string => `[${ps.map(pt).join(', ')}]`;
  return [
    `/** Town buildings (OSM, with heights): footprints, height and base (m; > 0: on the tunnel's roof). */`,
    `export const ${constName}_CITY: readonly {`,
    `  readonly points: readonly Vec2[];`,
    `  readonly height: number;`,
    `  readonly base: number;`,
    `  readonly name: string;`,
    `}[] = [`,
    ...town.city.map(
      (b) =>
        `  { points: ${poly(b.points)}, height: ${round(b.height)}, base: ${b.base}, name: ${JSON.stringify(b.name)} },`,
    ),
    `];`,
    ``,
    `/** The sea (from the OSM coastline), and land patches in it: polygons. */`,
    `export const ${constName}_SEA: readonly (readonly Vec2[])[] = [`,
    ...town.sea.map((ring) => `  ${poly(ring)},`),
    `];`,
    ``,
    `export const ${constName}_ISLANDS: readonly (readonly Vec2[])[] = [`,
    ...town.islands.map((ring) => `  ${poly(ring)},`),
    `];`,
    ``,
    `/** Piers and pontoons: walkways (lines) or decks (areas). */`,
    `export const ${constName}_PIERS: readonly { readonly points: readonly Vec2[]; readonly area: boolean }[] = [`,
    ...town.piers.map((p) => `  { points: ${poly(p.points)}, area: ${p.area} },`),
    `];`,
    ``,
    `/** Swimming pools: polygons. */`,
    `export const ${constName}_POOLS: readonly (readonly Vec2[])[] = [`,
    ...town.pools.map((ring) => `  ${poly(ring)},`),
    `];`,
    ``,
    `/** Trees of the streets and gardens (palms). */`,
    `export const ${constName}_PALMS: readonly Vec2[] = ${poly(town.palms)};`,
    ``,
    `/** The tunnel: lap fractions it covers (driving order), and its roof's top (m). */`,
    `export const ${constName}_TUNNEL: { readonly from: number; readonly to: number; readonly height: number } | null = ${
      town.tunnel
        ? `{ from: ${town.tunnel.from}, to: ${town.tunnel.to}, height: ${TUNNEL_TOP} }`
        : 'null'
    };`,
    ``,
  ];
}

/** The track's bounding box grown by `margin`. */
function trackBounds(track: Track, margin: number) {
  const xs = track.samples.map((s) => s.position.x);
  const zs = track.samples.map((s) => s.position.z);
  return {
    minX: Math.min(...xs) - margin,
    maxX: Math.max(...xs) + margin,
    minZ: Math.min(...zs) - margin,
    maxZ: Math.max(...zs) + margin,
  };
}

/**
 * Chains the oval's ways into lines, then keeps them as scenery: dropped where they run along the GP
 * track (shared straights), raised on a bridge where they cross it, banked in the curves.
 */
function ovalPieces(ways: Point[][], track: Track, halfDeck: number) {
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

/**
 * The sea within `box`, from coastline lines in game coordinates. OSM draws the coastline with the
 * land on its left; the game's z = -y mirrors that, so here the water is on the left of the line
 * ((-dz, dx)), the inside of a positively oriented polygon. Lines are cut by the box and closed
 * along its edges (in that orientation); closed loops are lakes (positive) or islands (negative).
 */
function seaPolygons(
  lines: readonly Point[][],
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
): { sea: Point[][]; islands: Point[][] } {
  const w = box.maxX - box.minX;
  const h = box.maxZ - box.minZ;
  const perimeter = 2 * (w + h);
  const inside = ([x, z]: Point): boolean =>
    x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ;
  // Position along the box's edge, going round positively: top, right, bottom, left (x right, z down).
  const along = ([x, z]: Point): number => {
    const d = [z - box.minZ, box.maxX - x, box.maxZ - z, x - box.minX];
    const edge = d.indexOf(Math.min(...d));
    return [x - box.minX, w + (z - box.minZ), w + h + (box.maxX - x), 2 * w + h + (box.maxZ - z)][
      edge
    ]!;
  };
  const corners: [number, Point][] = [
    [0, [box.minX, box.minZ]],
    [w, [box.maxX, box.minZ]],
    [w + h, [box.maxX, box.maxZ]],
    [2 * w + h, [box.minX, box.maxZ]],
  ];
  /** Where segment a → b leaves (or enters) the box. */
  const crossing = (a: Point, b: Point): Point => {
    let t = 1;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    for (const [edge, d, v] of [
      [box.minX, dx, a[0]],
      [box.maxX, dx, a[0]],
    ] as const) {
      if (d !== 0) {
        const s = (edge - v) / d;
        if (s >= 0 && s <= 1 && (inside(a) ? s < t : true)) t = Math.min(t, s);
      }
    }
    for (const [edge, d, v] of [
      [box.minZ, dz, a[1]],
      [box.maxZ, dz, a[1]],
    ] as const) {
      if (d !== 0) {
        const s = (edge - v) / d;
        if (s >= 0 && s <= 1) t = Math.min(t, s);
      }
    }
    return [a[0] + dx * t, a[1] + dz * t];
  };
  const area = (ring: readonly Point[]): number =>
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2;

  const pieces: { points: Point[]; from: number; to: number }[] = [];
  const sea: Point[][] = [];
  const islands: Point[][] = [];
  for (const line of lines) {
    const closed =
      line.length > 3 &&
      Math.hypot(line[0]![0] - line[line.length - 1]![0], line[0]![1] - line[line.length - 1]![1]) <
        3;
    if (closed && line.every(inside)) {
      (area(line) > 0 ? sea : islands).push(line.slice(0, -1));
      continue;
    }
    // The runs of the line inside the box, each from the box's edge to its edge.
    let run: Point[] | null = null;
    line.forEach((p, i) => {
      const prev = line[i - 1];
      if (inside(p)) {
        if (!run) {
          // Entering (or starting inside: the coastline data ends there; joined straight to the edge).
          run = prev ? [crossing(p, prev)] : [];
          if (!prev) run.push(nearestEdge(p, box));
        }
        run.push(p);
      } else if (run) {
        run.push(crossing(prev!, p));
        pieces.push({ points: run, from: along(run[0]!), to: along(run[run.length - 1]!) });
        run = null;
      }
    });
    if (run) {
      const r: Point[] = run;
      r.push(nearestEdge(r[r.length - 1]!, box));
      pieces.push({ points: r, from: along(r[0]!), to: along(r[r.length - 1]!) });
    }
  }
  // Chain the pieces: after one ends, go round the box positively to the next one's start.
  const used = new Set<number>();
  pieces.forEach((start, k) => {
    if (used.has(k)) return;
    used.add(k);
    const ring: Point[] = [...start.points];
    let at = start.to;
    for (;;) {
      let next = k;
      let best = (start.from - at + perimeter) % perimeter;
      pieces.forEach((p, j) => {
        if (used.has(j)) return;
        const d = (p.from - at + perimeter) % perimeter;
        if (d < best) {
          best = d;
          next = j;
        }
      });
      // The box's corners passed on the way, in order.
      const ahead = (c: number): number => (c - at + perimeter) % perimeter;
      corners
        .filter(([c]) => ahead(c) > 0 && ahead(c) < best)
        .sort(([a], [b]) => ahead(a) - ahead(b))
        .forEach(([, point]) => ring.push(point));
      if (next === k) break;
      used.add(next);
      ring.push(...pieces[next]!.points);
      at = pieces[next]!.to;
    }
    sea.push(ring);
  });
  return { sea, islands };
}

/** The point of the box's edge nearest to `p`. */
function nearestEdge(
  [x, z]: Point,
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
): Point {
  const d = [z - box.minZ, box.maxX - x, box.maxZ - z, x - box.minX];
  const edge = d.indexOf(Math.min(...d));
  return (
    [
      [x, box.minZ],
      [box.maxX, z],
      [x, box.maxZ],
      [box.minX, z],
    ] as Point[]
  )[edge]!;
}

/** Douglas–Peucker simplification of a closed ring (keeps points off the straight by > `tol`). */
function simplify(ring: readonly Point[], tol: number): Point[] {
  if (ring.length <= 4) return [...ring];
  const keep = new Array<boolean>(ring.length).fill(false);
  const far = (a: number, b: number): void => {
    let worst = -1;
    let at = -1;
    const [ax, az] = ring[a]!;
    const [bx, bz] = ring[b]!;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    for (let i = a + 1; i < b; i++) {
      const [px, pz] = ring[i]!;
      const d = Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol) {
      keep[at] = true;
      far(a, at);
      far(at, b);
    }
  };
  keep[0] = true;
  const mid = Math.floor(ring.length / 2);
  keep[mid] = true;
  far(0, mid);
  far(mid, ring.length - 1);
  keep[ring.length - 1] = true;
  return ring.filter((_, i) => keep[i]);
}

/** True when `p` is inside the polygon (even-odd rule). */
function insidePolygon([x, z]: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i]!;
    const [bx, bz] = polygon[j]!;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
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
