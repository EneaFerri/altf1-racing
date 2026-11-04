import { TRACK_RULES } from '../config/track';
import { wrapAngle } from '../math/angle';
import { SegmentGrid } from '../math/SegmentGrid';
import { sampleClosedSpline } from '../math/spline';
import { add, headingOf, normalize, right, scale, sub, type Vec2 } from '../math/vec2';
import { locateOnLoop, routeProgress } from './query';
import type {
  BranchSpan,
  KerbKind,
  RunoffKind,
  Track,
  PitLaneDefinition,
  TrackBranch,
  TrackDefinition,
  TrackPoint,
  TrackSample,
  TrackSide,
  WallSegment,
} from './types';

/** What else to build than the track every mode drives. */
export interface BuildOptions {
  /**
   * The drivable pit lane, from `def.pitLane` (Phase 4: the Grand Prix only, 01_docs/pitlane.md):
   * one more route, after the branches', with its own walls; the track's walls open into it.
   */
  readonly pitLane?: boolean;
}

/**
 * Compiles hand-authored track data into geometry, surfaces and lookup grids. Pure and deterministic.
 * With branches, also compiles one route per branch and outlines all the roads with one set of walls;
 * with `pitLane`, the pit lane's route too.
 */
export function buildTrack(def: TrackDefinition, options: BuildOptions = {}): Track {
  const rules = TRACK_RULES;
  const minWidth = def.minWidth ?? rules.minWidth;
  def.points.forEach(({ width }, i) => {
    if (width < minWidth) {
      throw new Error(`${def.name}: point ${i} is ${width} m wide, minimum is ${minWidth} m`);
    }
  });
  const sectorPoints = def.sectorPoints;
  if (
    sectorPoints &&
    (sectorPoints.length !== rules.sectorCount - 1 ||
      sectorPoints.some((p, i) => p <= (i === 0 ? 0 : sectorPoints[i - 1]!)) ||
      sectorPoints.some((p) => p >= def.points.length))
  ) {
    throw new Error(
      `${def.name}: sectorPoints must be ${rules.sectorCount - 1} increasing control points after 0`,
    );
  }
  for (const branch of def.branches ?? []) {
    branch.points.forEach(({ width }, i) => {
      if (width < rules.minShortcutWidth) {
        throw new Error(
          `${def.name}: branch point ${i} is ${width} m wide, minimum is ${rules.minShortcutWidth} m`,
        );
      }
    });
    if (!(0 < branch.fromPoint && branch.fromPoint < branch.toPoint)) {
      throw new Error(`${def.name}: a branch must run forwards and not over the start line`);
    }
  }

  const lane = options.pitLane ? def.pitLane : undefined;
  if (options.pitLane && !lane) throw new Error(`${def.name}: no pit lane in its data`);
  if (lane) checkPitLane(def, lane);

  const main = compileLoop(def, -1);
  const routes = (def.branches ?? []).map((branch, r) => compileRoute(def, branch, r, main));
  if (lane) routes.push(compilePitLane(def, lane, routes.length, main));
  if (routes.length === 0) return { ...main.track, routes: [] };
  const walls = outlineWalls(main.track, routes);
  return {
    ...main.track,
    walls,
    wallGrid: new SegmentGrid(walls.map((w) => [w.a, w.b] as const)),
    routes,
  };
}

interface Loop {
  readonly track: Track;
  /** Sample index of each control point. */
  readonly controlIndices: readonly number[];
}

/** The main loop with `branch` driven instead of the stretch it skips, plus where the branch runs. */
function compileRoute(def: TrackDefinition, branch: TrackBranch, route: number, main: Loop): Track {
  const { fromPoint, toPoint } = branch;
  const removed = toPoint - fromPoint - 1;
  const shift = branch.points.length - removed;
  const points = [
    ...def.points.slice(0, fromPoint + 1),
    ...branch.points,
    ...def.points.slice(toPoint),
  ];
  // High kerbs keep their corners: ranges after the branch move with the points, inside it vanish.
  const highKerbs = def.highKerbs.flatMap((range) => {
    if (range.toPoint <= fromPoint) return [range];
    if (range.fromPoint >= toPoint) {
      return [{ fromPoint: range.fromPoint + shift, toPoint: range.toPoint + shift }];
    }
    return [];
  });
  // Sectors are timed on main-loop progress: the route reuses the main loop's (set below).
  const loop = compileLoop({ ...def, points, highKerbs, sectorPoints: undefined }, route);
  const sampleAt = (control: number, of: Loop): TrackSample =>
    of.track.samples[of.controlIndices[control]!]!;
  const span = {
    from: sampleAt(fromPoint, loop).distance,
    to: sampleAt(fromPoint + branch.points.length + 1, loop).distance,
    mainFrom: sampleAt(fromPoint, main).distance,
    mainTo: sampleAt(toPoint, main).distance,
    start: 0,
    mainLength: main.track.length,
  };
  const progress = (d: number): number => routeProgress(span, d);
  return {
    ...loop.track,
    sectorStarts: main.track.sectorStarts,
    walls: loop.track.walls.map((w) => ({ ...w, progress: progress(w.progress) })),
    branch: span,
    routes: [],
  };
}

function checkPitLane(def: TrackDefinition, lane: PitLaneDefinition): void {
  const n = def.points.length;
  const valid = (p: number): boolean => Number.isInteger(p) && p >= 0 && p < n;
  if (!valid(lane.fromPoint) || !valid(lane.toPoint) || lane.fromPoint === lane.toPoint) {
    throw new Error(`${def.name}: the pit lane must leave and rejoin at two of the track's points`);
  }
  if (lane.points.length < 2 || lane.points.some((p) => !(p.width > 0))) {
    throw new Error(`${def.name}: the pit lane needs at least two points, each with a width`);
  }
}

/**
 * The pit lane's route: the main loop from where the lane rejoins (`toPoint`) round to where it
 * leaves (`fromPoint`), then the lane back to the start. Starting there lets it cross the start
 * line. No run-off (its walls are at its edges: the pit wall on one side, the garages on the
 * other) and no kerbs.
 */
function compilePitLane(
  def: TrackDefinition,
  lane: PitLaneDefinition,
  route: number,
  main: Loop,
): Track {
  const n = def.points.length;
  const around: TrackPoint[] = [];
  for (let i = lane.toPoint; ; i = (i + 1) % n) {
    around.push(def.points[i]!);
    if (i === lane.fromPoint) break;
  }
  const points = [...around, ...lane.points];
  const loop = compileLoop(
    { ...def, points, highKerbs: [], sectorPoints: undefined, runoffWidth: 0 },
    route,
  );
  const span: BranchSpan = {
    from: loop.track.samples[loop.controlIndices[around.length - 1]!]!.distance,
    to: loop.track.length,
    mainFrom: main.track.samples[main.controlIndices[lane.fromPoint]!]!.distance,
    mainTo: main.track.samples[main.controlIndices[lane.toPoint]!]!.distance,
    start: main.track.samples[main.controlIndices[lane.toPoint]!]!.distance,
    mainLength: main.track.length,
  };
  const onLane = (i: number): boolean => loop.track.samples[i]!.distance >= span.from;
  const noKerbs = (kerb: readonly KerbKind[]): KerbKind[] =>
    kerb.map((k, i) => (onLane(i) ? 'none' : k));
  const { left, right: rightSide } = loop.track.sides;
  return {
    ...loop.track,
    sectorStarts: main.track.sectorStarts,
    sides: {
      left: { ...left, kerb: noKerbs(left.kerb) },
      right: { ...rightSide, kerb: noKerbs(rightSide.kerb) },
    },
    walls: loop.track.walls.map((w) => ({ ...w, progress: routeProgress(span, w.progress) })),
    branch: span,
    pit: true,
    routes: [],
  };
}

/**
 * One outline for all the roads: the main loop's walls plus each route's walls along its branch,
 * leaving out every segment that lies entirely inside another road's drivable area (asphalt +
 * run-off), so the roads open into each other where they split and join. Segments only partly
 * inside stay: they close the corners there, leaving no gap a car could slip through.
 */
function outlineWalls(main: Track, routes: readonly Track[]): WallSegment[] {
  const roads: { track: Track; branchOnly: boolean }[] = [
    { track: main, branchOnly: false },
    ...routes.map((track) => ({ track, branchOnly: true })),
  ];
  const onBranch = (track: Track, distance: number): boolean =>
    !track.branch || (distance >= track.branch.from && distance <= track.branch.to);
  const inside = (road: Track, p: Vec2): boolean => {
    const loc = locateOnLoop(road, p);
    if (!onBranch(road, loc.distance)) return false;
    return Math.abs(loc.lateral) < loc.halfWidth + road.runoffWidth - 0.01;
  };
  const walls: WallSegment[] = [];
  roads.forEach(({ track, branchOnly }, r) => {
    const others = roads.filter((_, k) => k !== r).map((o) => o.track);
    for (const wall of track.walls) {
      if (branchOnly && !onBranch(track, track.samples[wall.sample]!.distance)) continue;
      const covered = others.some((other) => inside(other, wall.a) && inside(other, wall.b));
      if (!covered) walls.push(wall);
    }
  });
  return walls;
}

/** One closed road: samples, kerbs, run-off and its own walls (`route`: -1 = main loop). */
function compileLoop(def: TrackDefinition, route: number): Loop {
  const rules = TRACK_RULES;
  const {
    samples: points,
    params,
    controlIndices,
  } = sampleClosedSpline(
    def.points.map((p) => p.at),
    rules.sampleSpacing,
  );
  const n = points.length;
  const at = <T>(list: readonly T[], i: number): T => list[((i % n) + n) % n]!;

  const tangents = points.map((_, i) => normalize(sub(at(points, i + 1), at(points, i - 1))));
  const spacing = (i: number): number =>
    Math.hypot(at(points, i + 1).x - at(points, i).x, at(points, i + 1).z - at(points, i).z);

  let distance = 0;
  const samples: TrackSample[] = points.map((position, i) => {
    const tangent = tangents[i]!;
    // Heading decreases when turning right, so negate to make right turns positive.
    const turn = wrapAngle(headingOf(at(tangents, i + 1)) - headingOf(at(tangents, i - 1)));
    const sample: TrackSample = {
      position,
      tangent,
      normal: right(headingOf(tangent)),
      distance,
      curvature: -turn / (spacing(i - 1) + spacing(i)),
      halfWidth: widthAt(def, params[i]!) / 2,
      height: heightAt(def, params[i]!),
      grade: 0,
    };
    distance += spacing(i);
    return sample;
  });
  const length = distance;
  // Grade: the height's change over the samples either side.
  if (def.points.some((p) => p.height !== undefined)) {
    samples.forEach((s, i) => {
      const rise = at(samples, i + 1).height - at(samples, i - 1).height;
      samples[i] = { ...s, grade: rise / (spacing(i - 1) + spacing(i)) };
    });
  }

  // Side of the corner's inside for each sample (curvature > 0 = right turn = inside is right).
  const inside = (i: number): TrackSide => (samples[i]!.curvature > 0 ? 'right' : 'left');
  const opposite = (side: TrackSide): TrackSide => (side === 'right' ? 'left' : 'right');

  const kerb: Record<TrackSide, KerbKind[]> = {
    left: Array(n).fill('none'),
    right: Array(n).fill('none'),
  };
  const runoff: Record<TrackSide, RunoffKind[]> = {
    left: Array(n).fill('grass'),
    right: Array(n).fill('grass'),
  };
  const toSamples = (metres: number): number => Math.round(metres / rules.sampleSpacing);

  // Low kerbs: both sides of every real corner, extended a little before and after
  // (or of every sample, on tracks with kerbs everywhere).
  const kerbsEverywhere = def.kerbs === 'everywhere';
  samples.forEach((sample, i) => {
    if (!kerbsEverywhere && Math.abs(sample.curvature) < rules.kerbMinCurvature) return;
    for (let k = -toSamples(rules.kerbExtension); k <= toSamples(rules.kerbExtension); k++) {
      const j = (((i + k) % n) + n) % n;
      kerb.left[j] = 'low';
      kerb.right[j] = 'low';
    }
  });

  // Gravel traps outside tight corners, mostly downstream where cars run wide.
  samples.forEach((sample, i) => {
    if (Math.abs(sample.curvature) < rules.gravelMinCurvature) return;
    const outside = opposite(inside(i));
    for (let k = -toSamples(rules.gravelBefore); k <= toSamples(rules.gravelAfter); k++) {
      runoff[outside][(((i + k) % n) + n) % n] = 'gravel';
    }
  });

  // High kerbs on the inside of the declared corners (e.g. a chicane), replacing low ones.
  for (const { fromPoint, toPoint } of def.highKerbs) {
    const from = controlIndices[fromPoint]!;
    const span = (controlIndices[toPoint]! - from + n) % n;
    for (let k = 0; k <= span; k++) {
      const i = (from + k) % n;
      if (Math.abs(samples[i]!.curvature) >= rules.highKerbMinCurvature)
        kerb[inside(i)][i] = 'high';
    }
  }

  const walls = [
    ...buildWall(samples, def, 'left', route),
    ...buildWall(samples, def, 'right', route),
  ];
  const centerSegments = samples.map((s, i) => [s.position, at(samples, i + 1).position] as const);

  const track: Track = {
    name: def.name,
    maxHalfWidth: Math.max(...samples.map((s) => s.halfWidth)),
    elevated: def.points.some((p) => p.height !== undefined),
    runoffWidth: def.runoffWidth,
    kerbInset: def.kerbBand?.inset ?? rules.kerbInset,
    kerbOutset: def.kerbBand?.outset ?? rules.kerbOutset,
    length,
    sectorStarts: sectorStarts(def, samples, controlIndices, length),
    samples,
    sides: {
      left: { kerb: kerb.left, runoff: runoff.left },
      right: { kerb: kerb.right, runoff: runoff.right },
    },
    walls,
    centerGrid: new SegmentGrid(centerSegments),
    wallGrid: new SegmentGrid(walls.map((w) => [w.a, w.b] as const)),
    routes: [],
  };
  return { track, controlIndices };
}

/** Where each timing sector starts: at the declared control points, or every length / count. */
function sectorStarts(
  def: TrackDefinition,
  samples: readonly TrackSample[],
  controlIndices: readonly number[],
  length: number,
): number[] {
  const ends = def.sectorPoints
    ? def.sectorPoints.map((p) => samples[controlIndices[p]!]!.distance)
    : Array.from(
        { length: TRACK_RULES.sectorCount - 1 },
        (_, i) => ((i + 1) * length) / TRACK_RULES.sectorCount,
      );
  return [0, ...ends];
}

/** Width at spline parameter `param`, eased between control points so edges stay smooth. */
function widthAt(def: TrackDefinition, param: number): number {
  const n = def.points.length;
  const i = Math.floor(param);
  const f = param - i;
  const a = def.points[i % n]!.width;
  const b = def.points[(i + 1) % n]!.width;
  return a + ((b - a) * (1 - Math.cos(Math.PI * f))) / 2;
}

/**
 * Height at spline parameter `param`: a Catmull-Rom curve through the points' heights (0 where they
 * have none), so the grade changes smoothly too.
 */
function heightAt(def: TrackDefinition, param: number): number {
  const n = def.points.length;
  const i = Math.floor(param);
  const t = param - i;
  const h = (k: number): number => def.points[(((i + k) % n) + n) % n]!.height ?? 0;
  const [p0, p1, p2, p3] = [h(-1), h(0), h(1), h(2)];
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
  );
}

/** Wall polyline offset from the centreline (local width + run-off), each segment facing the track. */
function buildWall(
  samples: readonly TrackSample[],
  def: TrackDefinition,
  side: TrackSide,
  route: number,
): WallSegment[] {
  const sign = side === 'right' ? 1 : -1;
  const points = samples.map((s) =>
    add(s.position, scale(s.normal, sign * (s.halfWidth + def.runoffWidth))),
  );
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const toRight = right(headingOf(sub(b, a)));
    // The right wall faces left (towards the track) and vice versa.
    return {
      a,
      b,
      normal: side === 'right' ? scale(toRight, -1) : toRight,
      route,
      sample: i,
      progress: samples[i]!.distance,
    };
  });
}
