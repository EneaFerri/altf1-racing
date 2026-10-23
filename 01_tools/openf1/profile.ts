/**
 * Builds a circuit profile (`data/<id>.json`) from the downloaded data, in real metres:
 * the road centreline (OpenStreetMap, ordered and placed by the OpenF1 pole lap), the pole lap's
 * speed along it, its corners and where its sectors start.
 * Usage: node 01_tools/openf1/profile.ts <id> (after fetch.ts). Method: README.md.
 */
import { writeFileSync } from 'node:fs';
import { circuitById } from './circuits.ts';
import { closedLength, resampleClosed, smoothClosed, type Point } from './geometry.ts';
import {
  osmPath,
  profilePath,
  rawPath,
  readJson,
  type CircuitProfile,
  type RawOsmCircuit,
  type RawPoleLap,
} from './openf1.ts';

/** Station spacing (m). */
const SPACING = 5;
/** A lap point is moved onto the OSM centreline if this close to it (m); else it stays. */
const SNAP = 15;
/** A corner is the slowest point within this distance either side (m)... */
const CORNER_WINDOW = 150;
/** ...at least this much slower than the fastest point in the same window (km/h). */
const CORNER_DROP = 20;

const circuit = circuitById(process.argv[2] ?? '');
const raw = readJson<RawPoleLap>(rawPath(circuit.id));
const osm = readJson<RawOsmCircuit>(osmPath(circuit.id));
const { lap } = raw;
const start = Date.parse(lap.date_start!);
const end = start + lap.lap_duration! * 1000;

/** Linear interpolation of `value` over samples sorted by `key`, clamped at the ends. */
function interpolate<T>(samples: readonly T[], key: (s: T) => number, value: (s: T) => number) {
  return (at: number): number => {
    let i = 0;
    while (i < samples.length - 2 && key(samples[i + 1]!) < at) i++;
    const a = samples[i]!;
    const b = samples[i + 1]!;
    const f = Math.min(1, Math.max(0, (at - key(a)) / (key(b) - key(a))));
    return value(a) + (value(b) - value(a)) * f;
  };
}

// 1. The pole lap from line to line (m), ends interpolated at the exact crossing times.
const xAt = interpolate(
  raw.location,
  (p) => p[0],
  (p) => p[1] / 10,
);
const yAt = interpolate(
  raw.location,
  (p) => p[0],
  (p) => p[2] / 10,
);
const timed: { t: number; p: Point }[] = [
  { t: start, p: [xAt(start), yAt(start)] },
  ...raw.location
    .filter(([t]) => t > start && t < end)
    .map(([t, x, y]) => ({ t, p: [x / 10, y / 10] as Point })),
  { t: end, p: [xAt(end), yAt(end)] },
];
let travelled = 0;
const progress = timed.map((s, i) => {
  if (i > 0) travelled += Math.hypot(s.p[0] - timed[i - 1]!.p[0], s.p[1] - timed[i - 1]!.p[1]);
  return { t: s.t, d: travelled };
});
const lapLength = travelled;
const lapPath = timed.slice(0, -1).map((s) => s.p);
const lapStations = resampleClosed(lapPath, Math.round(lapLength / SPACING));
const lapSpacing = lapLength / lapStations.length;

// 2. The OSM centreline in the same frame: metres, then registered onto the lap.
const lat0 = osm.ways.flat().reduce((sum, [lat]) => sum + lat, 0) / osm.ways.flat().length;
const toMetres = ([lat, lon]: readonly [number, number]): Point => [
  lon * 111320 * Math.cos((lat0 * Math.PI) / 180),
  lat * 110574,
];
const segments = register(
  osm.ways.flatMap((way) =>
    way.slice(1).map((p, i): [Point, Point] => [toMetres(way[i]!), toMetres(p)]),
  ),
  lapStations,
);

// 3. Each lap station moved onto the road centreline (the lap is a racing line: it cuts corners).
let kept = 0;
const snapped = lapStations.map((p) => {
  const { point, distance } = nearestOnSegments(segments, p);
  if (distance <= SNAP) return point;
  kept++;
  return p;
});
const centre = smoothClosed(snapped, 1);
const along: number[] = [0];
centre.forEach((p, i) => {
  if (i > 0)
    along.push(along[i - 1]! + Math.hypot(p[0] - centre[i - 1]![0], p[1] - centre[i - 1]![1]));
});
const length = closedLength(centre);
const stations = resampleClosed(centre, Math.round(length / SPACING));
const spacing = length / stations.length;

// 4. Speed, sectors and corners carried over: lap time → lap distance → lap station → centreline.
const lapDistanceAt = interpolate(
  progress,
  (s) => s.t,
  (s) => s.d,
);
const timeAtLapDistance = interpolate(
  progress,
  (s) => s.d,
  (s) => s.t,
);
const speedAt = interpolate(
  raw.speed,
  (s) => s[0],
  (s) => s[1],
);
const centreDistance = interpolate(
  along.map((d, i) => ({ i, d })),
  (s) => s.i,
  (s) => s.d,
);
const lapIndexAt = interpolate(
  along.map((d, i) => ({ i, d })),
  (s) => s.d,
  (s) => s.i,
);
/** Centreline distance of the car at time `t`. */
const distanceAt = (t: number): number => centreDistance(lapDistanceAt(t) / lapSpacing);
const speed = stations.map((_, k) =>
  Math.round(speedAt(timeAtLapDistance(lapIndexAt(k * spacing) * lapSpacing))),
);

const s1 = lap.duration_sector_1!;
const s2 = lap.duration_sector_2!;
const s3 = lap.duration_sector_3!;
const sectorStarts = [s1, s1 + s2].map((t) => round(distanceAt(start + t * 1000))) as [
  number,
  number,
];

const window = Math.round(CORNER_WINDOW / spacing);
const around = (i: number): number[] =>
  Array.from(
    { length: 2 * window + 1 },
    (_, k) => speed[(i + k - window + speed.length) % speed.length]!,
  );
const corners = speed
  .map((v, i) => ({ at: round(i * spacing), speed: v, i }))
  .filter(
    ({ speed: v, i }) => v === Math.min(...around(i)) && Math.max(...around(i)) - v >= CORNER_DROP,
  )
  // A flat minimum spans several stations: keep its first one.
  .filter(({ i }, k, all) => k === 0 || all[k - 1]!.i !== i - 1)
  .map(({ at, speed: v }) => ({ at, speed: v }));

const profile: CircuitProfile = {
  name: circuit.name,
  source: { session: raw.session, driver: lap.driver_number, lap: lap.lap_number },
  pole: { time: lap.lap_duration!, sectors: [s1, s2, s3] },
  length: round(length),
  sectorStarts,
  spacing: round(spacing, 3),
  stations: stations.map((p) => [round(p[0]), round(p[1])]),
  speed,
  corners,
};
writeFileSync(profilePath(circuit.id), JSON.stringify(profile) + '\n');

const moved = lapStations.map((p, i) => Math.hypot(p[0] - snapped[i]![0], p[1] - snapped[i]![1]));
console.log(
  `${circuit.name}: ${Math.round(length)} m (pole lap path ${Math.round(lapLength)} m), ` +
    `pole ${lap.lap_duration} s by #${lap.driver_number}, sectors 2 and 3 start at ${sectorStarts.join(' / ')} m`,
);
console.log(
  `  racing line → road centreline: mean ${(moved.reduce((a, b) => a + b, 0) / moved.length).toFixed(1)} m, ` +
    `max ${Math.max(...moved).toFixed(1)} m; ${kept} of ${lapStations.length} points too far from OSM, kept`,
);
console.log(
  `  corners (m: km/h): ${corners.map((c) => `${Math.round(c.at)}: ${c.speed}`).join(', ')}`,
);

function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function nearestOnSegments(segs: readonly (readonly [Point, Point])[], p: Point) {
  let point: Point = p;
  let distance = Infinity;
  for (const [a, b] of segs) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const f =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const q: Point = [a[0] + dx * f, a[1] + dy * f];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < distance) {
      distance = d;
      point = q;
    }
  }
  return { point, distance };
}

/**
 * Moves the OSM segments onto the lap (rotation + translation, iterative closest point): the two
 * sources use different frames. Starts from matching centroids.
 */
function register(segs: [Point, Point][], reference: readonly Point[]): [Point, Point][] {
  const centroid = (ps: readonly Point[]): Point => [
    ps.reduce((sum, p) => sum + p[0], 0) / ps.length,
    ps.reduce((sum, p) => sum + p[1], 0) / ps.length,
  ];
  const transform =
    (angle: number, from: Point, to: Point) =>
    (p: Point): Point => {
      const dx = p[0] - from[0];
      const dy = p[1] - from[1];
      return [
        to[0] + dx * Math.cos(angle) - dy * Math.sin(angle),
        to[1] + dx * Math.sin(angle) + dy * Math.cos(angle),
      ];
    };
  const centre = centroid(segs.map(([a]) => a));
  let moved = segs.map(([a, b]): [Point, Point] => {
    const shift = transform(0, centre, centroid(reference));
    return [shift(a), shift(b)];
  });
  for (let iteration = 0; iteration < 30; iteration++) {
    const pairs = reference
      .filter((_, i) => i % 3 === 0)
      .map((r) => [r, nearestOnSegments(moved, r).point] as const);
    const mr = centroid(pairs.map(([r]) => r));
    const mq = centroid(pairs.map(([, q]) => q));
    let sxx = 0;
    let sxy = 0;
    for (const [r, q] of pairs) {
      sxx += (q[0] - mq[0]) * (r[0] - mr[0]) + (q[1] - mq[1]) * (r[1] - mr[1]);
      sxy += (q[0] - mq[0]) * (r[1] - mr[1]) - (q[1] - mq[1]) * (r[0] - mr[0]);
    }
    // Rotate the matched OSM points about their centroid and put it on the lap's.
    const step = transform(Math.atan2(sxy, sxx), mq, mr);
    moved = moved.map(([a, b]) => [step(a), step(b)]);
  }
  return moved;
}
