import { TRACK_RULES } from '../config/track';
import { wrapAngle } from '../math/angle';
import { SegmentGrid } from '../math/SegmentGrid';
import { sampleClosedSpline } from '../math/spline';
import { add, headingOf, normalize, right, scale, sub, type Vec2 } from '../math/vec2';
import { locateOnLoop, routeProgress } from './query';
import type {
  KerbKind,
  RunoffKind,
  Track,
  TrackBranch,
  TrackDefinition,
  TrackSample,
  TrackSide,
  WallSegment,
} from './types';

/**
 * Compiles hand-authored track data into geometry, surfaces and lookup grids. Pure and deterministic.
 * With branches, also compiles one route per branch and outlines all the roads with one set of walls.
 */
export function buildTrack(def: TrackDefinition): Track {
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

  const main = compileLoop(def, -1);
  const routes = (def.branches ?? []).map((branch, r) => compileRoute(def, branch, r, main));
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
    };
    distance += spacing(i);
    return sample;
  });
  const length = distance;

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
