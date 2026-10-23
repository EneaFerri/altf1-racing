/**
 * Profile (real metres) + adaptation (circuits.ts) → the game's TrackDefinition. Pure; used by
 * layout.ts (writes the layout file) and calibrate.ts (tries scales). Steps in README.md.
 */
import {
  buildTrack,
  dot,
  normalize,
  sub,
  type Track,
  type TrackDefinition,
} from '../../01_packages/shared/src/index.ts';
import { KERB_BAND, WIDTH_FACTOR, type CircuitConfig, type WidthMark } from './circuits.ts';
import type { Point } from './geometry.ts';
import type { CircuitProfile } from './openf1.ts';

/** Target distance between control points (m, game scale). */
const CONTROL_SPACING = 10;
/** Extra room kept beyond the walls' folding radius and between distant sections (m). */
const MARGIN = 2;
/** Sections this close along the lap are neighbours, not "distant" (m; buildTrack tests use 120). */
const NEIGHBOURS = 150;

export interface Generated {
  readonly definition: TrackDefinition;
  /** Game-scale stations after the adaptation, for previews: [x, z]. */
  readonly stations: readonly Point[];
  /** How the game's limits changed the real shape: stations moved > 1 m, rounds per cause. */
  readonly adapted: {
    readonly moved: number;
    readonly radiusRounds: number;
    readonly separationRounds: number;
    readonly foldRounds: number;
  };
}

export function generate(
  profile: CircuitProfile,
  circuit: CircuitConfig,
  scale: number,
): Generated {
  const n = profile.stations.length;
  // Real width at each station, then game width.
  const widths = profile.stations.map(
    (_, i) => widthAt(circuit.widths, i * profile.spacing, profile.length) * WIDTH_FACTOR,
  );
  const half = widths.map((w) => w / 2);

  let points: Point[] = profile.stations.map(toGame(profile, circuit, scale));
  const original = points;
  const spacing = profile.spacing * scale;

  // Game limits: corners wide enough for the walls not to fold, distant sections kept apart.
  const minRadius = half.map((h) => h + circuit.runoffWidth + MARGIN);
  const apart = Math.round(NEIGHBOURS / spacing);
  let radiusRounds = 0;
  let separationRounds = 0;
  for (let round = 0; ; round++) {
    if (round === 500) throw new Error(`${circuit.name}: the game's limits do not converge`);
    const opened = openTightCorners(points, minRadius);
    const separated = separate(opened.points, half, circuit.runoffWidth + MARGIN, apart);
    points = separated.points;
    if (opened.changed) radiusRounds++;
    if (separated.changed) separationRounds++;
    if (!opened.changed && !separated.changed) break;
  }
  // Control points: every `step` stations, so the spline's spacing stays even.
  const step = Math.max(1, Math.round(CONTROL_SPACING / spacing));
  const controls = Array.from({ length: Math.round(n / step) }, (_, k) => k * step);
  const controlAt = (distance: number): number =>
    Math.round(distance / profile.spacing / step) % controls.length;
  const round1 = (v: number): number => Math.round(v * 10) / 10;
  const toDefinition = (stations: readonly Point[]): TrackDefinition => ({
    name: circuit.name,
    minWidth: Math.floor(Math.min(...widths) * 10) / 10,
    runoffWidth: circuit.runoffWidth,
    ...(circuit.kerbs === 'everywhere' ? { kerbs: 'everywhere' as const } : {}),
    kerbBand: KERB_BAND,
    sectorPoints: profile.sectorStarts.map(controlAt),
    highKerbs: [],
    points: controls.map((i) => ({
      at: { x: round1(stations[i]![0]), z: round1(stations[i]![1]) },
      width: Math.round(widths[i]! * 10) / 10,
    })),
  });

  // The radius check above is approximate: the compiled spline can still fold a wall on the inside
  // of a corner. Build it and open only the corners where that really happens, a little at a time.
  let definition = toDefinition(points);
  let foldRounds = 0;
  for (;;) {
    const folded = foldedStations(buildTrack(definition), spacing, n);
    if (folded.length === 0) break;
    if (++foldRounds === 100) throw new Error(`${circuit.name}: walls still fold`);
    points = smoothAround(points, folded);
    definition = toDefinition(points);
  }

  const moved = (i: number): boolean =>
    Math.hypot(points[i]![0] - original[i]![0], points[i]![1] - original[i]![1]) > 1;
  return {
    definition,
    stations: points,
    adapted: {
      moved: points.filter((_, i) => moved(i)).length,
      radiusRounds,
      separationRounds,
      foldRounds,
    },
  };
}

/**
 * The profile's frame (real m, y north) → the game's (x, z): oriented like the owner's PNG (start
 * straight along `lineDirection`), scaled, start line at the origin. Real y points north and the
 * game's -z is "up" seen from above, so z = -y keeps clockwise clockwise.
 */
export function toGame(
  profile: CircuitProfile,
  circuit: CircuitConfig,
  scale: number,
): (p: readonly [number, number]) => Point {
  const [x0, y0] = profile.stations[0]!;
  const [x1, y1] = profile.stations[Math.round(50 / profile.spacing)]!;
  const turn = (circuit.lineDirection * Math.PI) / 180 - Math.atan2(y1 - y0, x1 - x0);
  const cos = Math.cos(turn) * scale;
  const sin = Math.sin(turn) * scale;
  return ([x, y]) => {
    const dx = x - x0;
    const dy = y - y0;
    return [dx * cos - dy * sin, -(dx * sin + dy * cos)];
  };
}

/**
 * Real width at `distance` from the line: eased between the circuit's width marks (cosine, like
 * buildTrack's widths), wrapping over the line.
 */
export function widthAt(marks: readonly WidthMark[], distance: number, length: number): number {
  const next = marks.findIndex((m) => m.at > distance);
  const b = next === -1 ? marks[0]! : marks[next]!;
  const a =
    next === -1 ? marks[marks.length - 1]! : marks[(next - 1 + marks.length) % marks.length]!;
  const span = (b.at - a.at + length) % length || length;
  const f = ((distance - a.at + length) % length) / span;
  return a.width + ((b.width - a.width) * (1 - Math.cos(Math.PI * f))) / 2;
}

/** Radius of the circle through stations i-2, i, i+2 (Infinity on a straight): over ~10 m, so
 * station noise doesn't count; MARGIN covers the spline's slightly tighter peak. */
function radiusAt(points: readonly Point[], i: number): number {
  const n = points.length;
  const a = points[(i - 2 + n) % n]!;
  const b = points[i]!;
  const c = points[(i + 2) % n]!;
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return area2 < 1e-9 ? Infinity : (ab * bc * ca) / (2 * area2);
}

/** Smooths the stations around every corner tighter than its minimum radius (opens it up). */
function openTightCorners(points: Point[], minRadius: readonly number[]) {
  const tight = points.map((_, i) => i).filter((i) => radiusAt(points, i) < minRadius[i]!);
  if (tight.length === 0) return { points, changed: false };
  return { points: smoothAround(points, tight), changed: true };
}

/** One smoothing pass over the stations within 4 of each of `centres`: opens a corner up a bit. */
function smoothAround(points: readonly Point[], centres: readonly number[]): Point[] {
  const n = points.length;
  const out = [...points];
  const touched = new Set<number>();
  for (const i of centres) for (let k = -4; k <= 4; k++) touched.add((i + k + n) % n);
  for (const i of touched) {
    const a = points[(i - 1 + n) % n]!;
    const c = points[(i + 1) % n]!;
    const p = points[i]!;
    out[i] = [p[0] + 0.5 * ((a[0] + c[0]) / 2 - p[0]), p[1] + 0.5 * ((a[1] + c[1]) / 2 - p[1])];
  }
  return out;
}

/** Stations next to the main loop's wall segments that run against the track (a folded wall). */
function foldedStations(track: Track, spacing: number, n: number): number[] {
  const stations = track.walls
    .filter((w) => w.route < 0)
    .filter((w) => dot(normalize(sub(w.b, w.a)), track.samples[w.sample]!.tangent) <= 0)
    .map((w) => Math.round(track.samples[w.sample]!.distance / spacing) % n);
  return [...new Set(stations)];
}

/**
 * Pushes apart distant sections closer than both half-widths plus both run-offs (e.g. where the
 * real track crosses at another height), moving a smooth stretch of each.
 */
function separate(points: Point[], half: readonly number[], clearance: number, apart: number) {
  const n = points.length;
  const shift = points.map((): [number, number] => [0, 0]);
  let changed = false;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + apart; j < n; j += 2) {
      if (n - (j - i) < apart) break;
      const dx = points[i]![0] - points[j]![0];
      const dz = points[i]![1] - points[j]![1];
      const d = Math.hypot(dx, dz);
      const need = half[i]! + half[j]! + 2 * clearance;
      if (d >= need) continue;
      changed = true;
      const push = (need - d) / 2 / 4; // a quarter of the gap per round: converges smoothly
      const ux = dx / d;
      const uz = dz / d;
      for (let k = -8; k <= 8; k++) {
        const w = Math.exp(-(k * k) / 18);
        const a = shift[(i + k + n) % n]!;
        const b = shift[(j + k + n) % n]!;
        a[0] += ux * push * w;
        a[1] += uz * push * w;
        b[0] -= ux * push * w;
        b[1] -= uz * push * w;
      }
    }
  }
  if (!changed) return { points, changed };
  return {
    points: points.map((p, i): Point => [p[0] + shift[i]![0], p[1] + shift[i]![1]]),
    changed,
  };
}
