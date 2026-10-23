/** Small polyline helpers for the tool (closed loops of [x, y] points, metres). */
export type Point = readonly [number, number];

export const mean = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/** `p`-th percentile (0..100) of already sorted values, linearly interpolated; NaN if empty. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const at = (p / 100) * (sorted.length - 1);
  const i = Math.floor(at);
  const next = sorted[Math.min(i + 1, sorted.length - 1)]!;
  return sorted[i]! + (next - sorted[i]!) * (at - i);
}

export function closedLength(points: readonly Point[]): number {
  let length = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  return length;
}

/** `count` points evenly spaced along the closed loop, the first one on `points[0]`. */
export function resampleClosed(points: readonly Point[], count: number): Point[] {
  const step = closedLength(points) / count;
  const out: Point[] = [];
  let segment = 0;
  let segmentStart = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    for (;;) {
      const a = points[segment % points.length]!;
      const b = points[(segment + 1) % points.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segmentStart + length >= target || segment >= points.length - 1) {
        const f = length === 0 ? 0 : Math.min(1, (target - segmentStart) / length);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        break;
      }
      segmentStart += length;
      segment++;
    }
  }
  return out;
}

/** Closed moving average over ±`radius` points. */
export function smoothClosed(points: readonly Point[], radius: number): Point[] {
  const n = points.length;
  return points.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -radius; k <= radius; k++) {
      const p = points[(((i + k) % n) + n) % n]!;
      x += p[0];
      y += p[1];
    }
    return [x / (2 * radius + 1), y / (2 * radius + 1)];
  });
}
