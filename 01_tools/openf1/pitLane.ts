/**
 * A real circuit's pit lane from OpenStreetMap (Phase 4): the real lane in driving order
 * (`realPitLane`, also the decorative one in scenery.ts), and the drivable one written into the
 * game layout by layout.ts (`pitLaneOf`): where it really leaves and rejoins the track, its
 * speed-limited stretch, the boxes along the real garages. See 01_docs/pitlane.md.
 */
import {
  locateOnTrack,
  MAX_PLAYERS,
  vec2,
  type PitLaneDefinition,
  type Track,
  type TrackDefinition,
  type TrackPoint,
} from '../../01_packages/shared/src/index.ts';
import type { CircuitConfig } from './circuits.ts';
import { chain, type Point } from './geometry.ts';
import { realLocator, type RealLocation } from './locate.ts';
import { osmToProfile, type CircuitProfile, type RawScenery } from './openf1.ts';

/** Pit lane: width (m, real), and the pit wall between it and the track's wall (m, game). */
export const PIT_LANE_WIDTH = 12;
export const PIT_WALL = 1;
/** Each pit lane point is located within this (plus the step) along the lap of the previous one (m, real). */
const LANE_FOLLOW = 60;
/** The real pit lane speed limit (km/h) unless the circuit gives its own. */
const PIT_SPEED_LIMIT = 80;
/**
 * The real lane counts as fully beside the track from this far beyond the real asphalt (m, real):
 * half its width and a real pit wall. From there it runs behind the game's pit wall; nearer, it is
 * the entry or exit, blending from the real line across the track to there.
 */
const BESIDE_GAP = PIT_LANE_WIDTH / 2 + 1;
/** Pit buildings: within this distance of the pit lane (m, real), at least this long (m, real). */
const PIT_REACH = 80;
const MIN_BUILDING = 12;
/** Without real garages the boxes fill the speed-limited stretch but this share at each end. */
const BOX_ENDS = 0.15;
/** Lane points this close to the control point it leaves or rejoins at are left out (m, game). */
const NEAR_POINT = 3;
/**
 * At the edge (`pitLaneAtEdge`): the lane joins the track this far along it from where it leaves
 * the main loop's point (m, game), and its points are kept at least this far apart (m, game).
 */
const EDGE_LEAD = 30;
const EDGE_SPACING = 4;
/** At the edge, the lane's points are smoothed this many times (entry, step behind the wall, exit). */
const EDGE_SMOOTHING = 4;
/** A wall at least this far along the lap from the lane's point belongs to another stretch (m, game). */
const OTHER_STRETCH = 60;
/** Squeezed lane points keep this much more room (m): the lane between two of them cuts a bend. */
const SQUEEZE_MARGIN = 0.5;

/** A lap fraction difference brought into (-0.5, 0.5]: the short way round the lap. */
export const wrapped = (d: number): number => (((d % 1) + 1.5) % 1) - 0.5;

/** The real pit lane: its points (real m) and where each is on the real circuit, in driving order. */
export interface RealPitLane {
  readonly points: readonly Point[];
  readonly located: readonly RealLocation[];
  /** −1 = left of the track, 1 = right. */
  readonly side: -1 | 1;
}

/**
 * OSM's pit lane ways (entry, lane, exit) joined into one line in the driving direction. Each point
 * is located near the previous one's station, so the lane follows one stretch even where another
 * runs close on its other side (Monaco's pits, between the start straight and the Piscine). Points
 * running back along the lap (a spur into the garages) are left out.
 */
export function realPitLane(
  profile: CircuitProfile,
  circuit: CircuitConfig,
  raw: RawScenery,
): RealPitLane {
  const toProfile = osmToProfile(profile.osmFrame);
  const relative = realLocator(profile, circuit, LANE_FOLLOW);
  const ways = raw.features.filter((f) => f.kind === 'pitLane').map((f) => f.points.map(toProfile));
  if (ways.length === 0) throw new Error(`${circuit.name}: no pit lane in the OSM data`);
  const line = chain(ways).reduce((longest, l) => (l.length > longest.length ? l : longest));
  const follow = (ps: readonly Point[]): RealLocation[] => {
    const out: RealLocation[] = [];
    ps.forEach((p, i) => {
      if (i === 0) return out.push(relative(p));
      const step = Math.hypot(p[0] - ps[i - 1]![0], p[1] - ps[i - 1]![1]);
      return out.push(relative(p, out[i - 1]!.index, LANE_FOLLOW + step));
    });
    return out;
  };
  const ats = follow(line).map((r) => r.at);
  const forward = ats.slice(1).reduce((sum, at, i) => sum + wrapped(at - ats[i]!), 0) > 0;
  const ordered = forward ? line : [...line].reverse();
  const located = follow(ordered);
  const keep = located.map(() => true);
  let last = located[0]!.at;
  located.forEach((r, i) => {
    if (i > 0 && wrapped(r.at - last) < -0.002) keep[i] = false;
    else last = r.at;
  });
  const kept = located.filter((_, i) => keep[i]);
  return {
    points: ordered.filter((_, i) => keep[i]),
    located: kept,
    side: kept.reduce((sum, r) => sum + r.lateral, 0) >= 0 ? 1 : -1,
  };
}

/** The drivable pit lane and what the tool reports about it. */
export interface PitLane {
  readonly definition: PitLaneDefinition;
  /** Lane points whose edge comes closer than the pit wall to another stretch's wall. */
  readonly conflicts: readonly {
    readonly at: number;
    readonly clearance: number;
    readonly x: number;
    readonly z: number;
  }[];
  /** Length of its centreline (m, game). */
  readonly length: number;
  /** Metres along the lane of each of `definition.points`. */
  readonly along: readonly number[];
  /** Where the boxes come from: the real pit buildings, or spread over the limited stretch. */
  readonly boxesFrom: 'pit buildings' | 'spread';
}

/**
 * The game's pit lane of `circuit` on its game `track` (built from `definition`). Along the lap
 * every point stays where the real one is. Across it: on the real asphalt it follows the real line
 * over the (wider) game track; fully beside the track it runs right behind the game's pit wall,
 * keeping the real lane's shape beyond that, but never nearer than the pit wall to another stretch
 * (the wider game track leaves less room: Monaco's lane, by the Piscine); in between (entry and
 * exit) it blends.
 */
export function pitLaneOf(
  circuit: CircuitConfig,
  profile: CircuitProfile,
  raw: RawScenery,
  track: Track,
  definition: TrackDefinition,
): PitLane {
  const real = realPitLane(profile, circuit, raw);
  const n = track.samples.length;
  const sampleAt = (at: number) => track.samples[((Math.round(at * n) % n) + n) % n]!;
  const laneHalf = (PIT_LANE_WIDTH * circuit.scale) / 2;
  const elevated = definition.points[0]!.height !== undefined;

  /** How far the lane's edge at (x, z) is from the walls of every other stretch than `at`'s, beyond the pit wall. */
  const room = (x: number, z: number, at: number): number => {
    let clearance = Infinity;
    for (const wall of track.walls) {
      if (Math.abs(wrapped(wall.progress / track.length - at)) * track.length < OTHER_STRETCH) {
        continue;
      }
      clearance = Math.min(clearance, segmentDistance({ x, z }, wall.a, wall.b) - laneHalf);
    }
    return clearance - PIT_WALL;
  };
  // Each real point's place across the track (signed offset from the centreline): `base` with the
  // real lane's shape beyond the pit wall, `floor` right behind the pit wall.
  const placed = real.located.map((r) => {
    const s = sampleAt(r.at);
    const beside = smoothstep(r.edgeGap / BESIDE_GAP);
    // On the real asphalt: the real line over the game's width, or (at the edge) right beside it.
    const onTrack = circuit.pitLaneAtEdge
      ? Math.max(s.halfWidth + laneHalf, (Math.abs(r.lateral) * s.halfWidth) / r.halfWidth)
      : (Math.abs(r.lateral) * s.halfWidth) / r.halfWidth;
    const wall = s.halfWidth + track.runoffWidth + PIT_WALL + laneHalf;
    const extra = Math.max(0, r.edgeGap - BESIDE_GAP) * circuit.scale;
    return {
      r,
      s,
      floor: (1 - beside) * onTrack + beside * wall,
      base: (1 - beside) * onTrack + beside * (wall + extra),
    };
  });
  const at = (p: (typeof placed)[number], offset: number): { x: number; z: number } => ({
    x: p.s.position.x + p.s.normal.x * real.side * offset,
    z: p.s.position.z + p.s.normal.z * real.side * offset,
  });
  // At the edge: the real points that land on the same spot (Monaco's entry runs across the lap)
  // thinned out, and the offsets smoothed along the lane, so its walls never fold where it steps
  // from the track's edge to behind the pit wall.
  let kept = placed;
  if (circuit.pitLaneAtEdge) {
    kept = placed.reduce<typeof placed>((list, p) => {
      const last = list[list.length - 1];
      const [a, b] = [last && at(last, last.base), at(p, p.base)];
      return !a || Math.hypot(b.x - a.x, b.z - a.z) >= EDGE_SPACING ? [...list, p] : list;
    }, []);
    for (let k = 0; k < EDGE_SMOOTHING; k++) {
      kept = kept.map((p, i) => {
        const a = kept[i - 1];
        const b = kept[i + 1];
        if (!a || !b) return p;
        return {
          ...p,
          floor: (a.floor + 2 * p.floor + b.floor) / 4,
          base: (a.base + 2 * p.base + b.base) / 4,
        };
      });
    }
  }
  const spaced = kept.map((p) => {
    // Squeezed back towards its own track while another stretch is too close (not past the wall).
    let offset = p.base;
    for (let round = 0; round < 8 && offset > p.floor; round++) {
      const { x, z } = at(p, offset);
      const short = room(x, z, p.r.at) - SQUEEZE_MARGIN;
      if (short >= 0) break;
      offset = Math.max(p.floor, offset + short);
    }
    return { at: p.r.at, beside: p.r.edgeGap >= BESIDE_GAP, ...at(p, offset), height: p.s.height };
  });
  // At the edge, the lane's points smoothed too (Monaco's turns away from La Rascasse tighter
  // than its half-width), each only where it keeps its room from the other stretches.
  for (let k = 0; circuit.pitLaneAtEdge && k < EDGE_SMOOTHING; k++) {
    const before = spaced.map((p) => ({ x: p.x, z: p.z }));
    spaced.forEach((p, i) => {
      const a = before[i - 1];
      const b = before[i + 1];
      if (!a || !b) return;
      const x = (a.x + 2 * before[i]!.x + b.x) / 4;
      const z = (a.z + 2 * before[i]!.z + b.z) / 4;
      if (room(x, z, p.at) < SQUEEZE_MARGIN) return;
      p.x = x;
      p.z = z;
    });
  }

  // The main-loop control points it leaves after and rejoins before; the points between them.
  const pointAt = definition.points.map((p) => locateOnTrack(track, p.at).distance / track.length);
  const atOf = (i: number): number => pointAt[i]!;
  // At the edge it joins EDGE_LEAD m after its main-loop point (and as far before the other):
  // the road turns into it gradually.
  const lead = circuit.pitLaneAtEdge ? EDGE_LEAD / track.length : 0;
  const firstAt = spaced[0]!.at - lead;
  const lastAt = spaced[spaced.length - 1]!.at + lead;
  const indices = definition.points.map((_, i) => i);
  const fromPoint = indices.reduce(
    (best, i) => {
      const d = wrapped(atOf(i) - firstAt);
      return d < 0 && d > wrapped(atOf(best) - firstAt) ? i : best;
    },
    indices.find((i) => wrapped(atOf(i) - firstAt) < 0)!,
  );
  const toPoint = indices.reduce(
    (best, i) => {
      const d = wrapped(atOf(i) - lastAt);
      return d > 0 && d < wrapped(atOf(best) - lastAt) ? i : best;
    },
    indices.find((i) => wrapped(atOf(i) - lastAt) > 0)!,
  );
  const near = (p: { x: number; z: number }, i: number): boolean => {
    const { at } = definition.points[i]!;
    return Math.hypot(p.x - at.x, p.z - at.z) < NEAR_POINT;
  };
  const span = wrapped(atOf(toPoint) - atOf(fromPoint));
  const inside = spaced.filter((p) => {
    const d = wrapped(p.at - atOf(fromPoint));
    return d > 0 && d < span && !near(p, fromPoint) && !near(p, toPoint);
  });
  const width = round(2 * laneHalf, 1);
  const points: TrackPoint[] = inside.map((p) => ({
    at: vec2(round(p.x, 2), round(p.z, 2)),
    width,
    ...(elevated && { height: round(p.height, 2) }),
  }));

  // Metres along the lane: from where it leaves the main loop, through its points.
  const start = definition.points[fromPoint]!.at;
  const along: number[] = [];
  inside.forEach((p, i) => {
    const prev = i === 0 ? start : inside[i - 1]!;
    along.push((i === 0 ? 0 : along[i - 1]!) + Math.hypot(p.x - prev.x, p.z - prev.z));
  });

  // The speed-limited stretch: where the real lane runs fully beside the track.
  const besideIndices = inside.flatMap((p, i) => (p.beside ? [i] : []));
  if (besideIndices.length < 2) {
    throw new Error(`${circuit.name}: the pit lane is never beside the track`);
  }
  const limit = {
    from: along[besideIndices[0]!]!,
    to: along[besideIndices[besideIndices.length - 1]!]!,
  };
  /** Metres along the lane where it is beside lap fraction `at` (along its limited stretch). */
  const alongAt = (at: number): number => {
    const ats = besideIndices.map((i) => wrapped(inside[i]!.at - inside[besideIndices[0]!]!.at));
    const d = wrapped(at - inside[besideIndices[0]!]!.at);
    const k = ats.findIndex((a, j) => j + 1 < ats.length && d >= a && d <= ats[j + 1]!);
    if (k < 0) return d < 0 ? limit.from : limit.to;
    const f = (d - ats[k]!) / (ats[k + 1]! - ats[k]! || 1);
    const a = along[besideIndices[k]!]!;
    return a + (along[besideIndices[k + 1]!]! - a) * f;
  };

  // Boxes along the real pit buildings (OSM), else spread over the limited stretch.
  const toProfile = osmToProfile(profile.osmFrame);
  const relative = realLocator(profile, circuit, PIT_REACH);
  const garages = circuit.town
    ? []
    : raw.features
        .filter((f) => f.kind === 'building')
        .map((f) => f.points.map(toProfile))
        .filter(
          (ps) =>
            ps.every((p) =>
              real.points.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < PIT_REACH),
            ) && polylineLength(ps) / 2 >= MIN_BUILDING,
        )
        .flatMap((ps) => ps.map((p) => relative(p)))
        .filter((r) => Math.sign(r.lateral) === real.side)
        .map((r) => alongAt(r.at));
  const limitLength = limit.to - limit.from;
  const fromReal =
    garages.length > 0 && Math.max(...garages) - Math.min(...garages) > 0.3 * limitLength;
  const [boxFrom, boxTo] = fromReal
    ? [Math.min(...garages), Math.max(...garages)]
    : [limit.from + BOX_ENDS * limitLength, limit.to - BOX_ENDS * limitLength];
  const boxes = Array.from({ length: MAX_PLAYERS }, (_, i) =>
    round(boxFrom + ((i + 0.5) / MAX_PLAYERS) * (boxTo - boxFrom), 1),
  );

  // Checks: every ~2 m of the lane, its edge stays clear of every other stretch's wall.
  const dense = densify([...inside.map((p) => ({ at: p.at, x: p.x, z: p.z }))], 2);
  const conflicts = dense.flatMap((p) => {
    const clearance = room(p.x, p.z, p.at) + PIT_WALL;
    return clearance < PIT_WALL
      ? [{ at: round(p.at, 5), clearance: round(clearance, 1), x: p.x, z: p.z }]
      : [];
  });

  return {
    definition: {
      side: real.side > 0 ? 'right' : 'left',
      fromPoint,
      toPoint,
      points,
      limit: { from: round(limit.from, 1), to: round(limit.to, 1) },
      speedLimit: round(((circuit.pitSpeedLimit ?? PIT_SPEED_LIMIT) / 3.6) * circuit.scale, 2),
      boxes,
    },
    conflicts,
    length: polylineLength(inside.map((p) => [p.x, p.z] as const)),
    along,
    boxesFrom: fromReal ? 'pit buildings' : 'spread',
  };
}

/** 0 → 0, 1 → 1, smooth at both ends; clamped. */
function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function polylineLength(ps: readonly Point[]): number {
  return ps.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - ps[i]![0], p[1] - ps[i]![1]), 0);
}

/** Points every ~`step` m along the lane, with their lap fractions interpolated. */
function densify(
  ps: readonly { at: number; x: number; z: number }[],
  step: number,
): { at: number; x: number; z: number }[] {
  const out: { at: number; x: number; z: number }[] = [];
  ps.forEach((p, i) => {
    const q = ps[i + 1];
    if (!q) return out.push(p);
    const count = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / step));
    const dAt = wrapped(q.at - p.at);
    for (let k = 0; k < count; k++) {
      const f = k / count;
      out.push({ at: p.at + dAt * f, x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f });
    }
    return undefined;
  });
  return out;
}

function segmentDistance(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
