import { TRACK_RULES } from '../config/track';
import { wrapAngle } from '../math/angle';
import { SegmentGrid } from '../math/SegmentGrid';
import { sampleClosedSpline } from '../math/spline';
import { add, headingOf, normalize, right, scale, sub } from '../math/vec2';
import type {
  KerbKind,
  RunoffKind,
  Track,
  TrackDefinition,
  TrackSample,
  TrackSide,
  WallSegment,
} from './types';

/** Compiles hand-authored track data into geometry, surfaces and lookup grids. Pure and deterministic. */
export function buildTrack(def: TrackDefinition): Track {
  const rules = TRACK_RULES;
  const { samples: points, controlIndices } = sampleClosedSpline(def.points, rules.sampleSpacing);
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

  // Low kerbs: both sides of every real corner, extended a little before and after.
  samples.forEach((sample, i) => {
    if (Math.abs(sample.curvature) < rules.kerbMinCurvature) return;
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

  const walls = [...buildWall(samples, def, 'left'), ...buildWall(samples, def, 'right')];
  const centerSegments = samples.map((s, i) => [s.position, at(samples, i + 1).position] as const);

  return {
    name: def.name,
    halfWidth: def.halfWidth,
    runoffWidth: def.runoffWidth,
    length,
    samples,
    sides: {
      left: { kerb: kerb.left, runoff: runoff.left },
      right: { kerb: kerb.right, runoff: runoff.right },
    },
    walls,
    centerGrid: new SegmentGrid(centerSegments),
    wallGrid: new SegmentGrid(walls.map((w) => [w.a, w.b] as const)),
  };
}

/** Wall polyline offset from the centreline, each segment facing the track. */
function buildWall(
  samples: readonly TrackSample[],
  def: TrackDefinition,
  side: TrackSide,
): WallSegment[] {
  const offset = (def.halfWidth + def.runoffWidth) * (side === 'right' ? 1 : -1);
  const points = samples.map((s) => add(s.position, scale(s.normal, offset)));
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const toRight = right(headingOf(sub(b, a)));
    // The right wall faces left (towards the track) and vice versa.
    return { a, b, normal: side === 'right' ? scale(toRight, -1) : toRight };
  });
}
