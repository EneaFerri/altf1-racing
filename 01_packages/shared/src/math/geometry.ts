import { dot, lerp, sub, type Vec2 } from './vec2';

export interface SegmentProjection {
  /** 0..1 position of the closest point along the segment. */
  readonly t: number;
  readonly point: Vec2;
}

/** Closest point to `p` on the segment a→b. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): SegmentProjection {
  const ab = sub(b, a);
  const lengthSq = dot(ab, ab);
  const t = lengthSq > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / lengthSq)) : 0;
  return { t, point: lerp(a, b, t) };
}
