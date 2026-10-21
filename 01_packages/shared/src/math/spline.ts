import { distance, lerp, type Vec2 } from './vec2';

/** Sub-steps per spline span before arc-length resampling; high enough that the polyline is smooth. */
const SUBDIVISIONS = 24;

/**
 * Samples a closed centripetal Catmull-Rom spline through `points` at (roughly) even arc-length
 * `spacing`. Centripetal parameterisation avoids loops and cusps on uneven control points.
 * Returns the samples, each sample's spline parameter (`3.42` = 42% of the way from control point 3
 * to 4, useful to interpolate per-point data such as width) and, for each control point, the index
 * of the sample closest to it.
 */
export function sampleClosedSpline(
  points: readonly Vec2[],
  spacing: number,
): { samples: Vec2[]; params: number[]; controlIndices: number[] } {
  const n = points.length;
  const dense: Vec2[] = [];
  const controlDense: number[] = [];
  for (let i = 0; i < n; i++) {
    controlDense.push(dense.length);
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    for (let s = 0; s < SUBDIVISIONS; s++)
      dense.push(centripetal(p0, p1, p2, p3, s / SUBDIVISIONS));
  }

  // Resample the dense polyline at even arc length.
  const cumulative = [0];
  for (let i = 1; i <= dense.length; i++) {
    cumulative.push(cumulative[i - 1]! + distance(dense[i - 1]!, dense[i % dense.length]!));
  }
  const total = cumulative[dense.length]!;
  const count = Math.max(3, Math.round(total / spacing));
  const step = total / count;

  const samples: Vec2[] = [];
  const params: number[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (cumulative[seg + 1]! < target) seg++;
    const segLength = cumulative[seg + 1]! - cumulative[seg]!;
    const t = segLength > 0 ? (target - cumulative[seg]!) / segLength : 0;
    samples.push(lerp(dense[seg]!, dense[(seg + 1) % dense.length]!, t));
    params.push(((seg + t) / SUBDIVISIONS) % n);
  }

  const controlIndices = controlDense.map((d) => Math.round(cumulative[d]! / step) % count);
  return { samples, params, controlIndices };
}

function centripetal(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const knot = (a: Vec2, b: Vec2): number => Math.max(Math.sqrt(distance(a, b)), 1e-6);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;

  const a1 = lerp(p0, p1, t / t1);
  const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
  const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
  const b1 = lerp(a1, a2, t / t2);
  const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
  return lerp(b1, b2, (t - t1) / (t2 - t1));
}
