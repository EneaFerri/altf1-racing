/**
 * Real points located on the real circuit (the profile's stations): where along the lap, how far
 * to the side and how far beyond the real asphalt. Shared by scenery.ts and pitLane.ts.
 */
import type { CircuitConfig } from './circuits.ts';
import { widthAt } from './generate.ts';
import type { Point } from './geometry.ts';
import type { CircuitProfile } from './openf1.ts';

/** A real point on the real circuit. */
export interface RealLocation {
  /** Nearest station, and the lap fraction there (0 = start line). */
  readonly index: number;
  readonly at: number;
  /** Signed offset from the centreline (m, real; + right of the driving direction). */
  readonly lateral: number;
  /** Metres beyond the real asphalt's edge (negative: on the asphalt). */
  readonly edgeGap: number;
  /** Half of the real asphalt's width there (m). */
  readonly halfWidth: number;
}

/**
 * Locates real points on `profile`'s stations; with `around`, only the stations within `reach` m
 * (`defaultReach` unless given) of that one are searched, so a point can't jump to another stretch
 * of the lap that passes close behind.
 */
export function realLocator(
  profile: CircuitProfile,
  circuit: CircuitConfig,
  defaultReach: number,
): (p: Point, around?: number, reach?: number) => RealLocation {
  const stations = profile.stations;
  const n = stations.length;
  return (p, around, reach = defaultReach) => {
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
    const halfWidth = widthAt(circuit.widths, best * profile.spacing, profile.length) / 2;
    return {
      index: best,
      at: best / n,
      lateral,
      edgeGap: Math.abs(lateral) - halfWidth,
      halfWidth,
    };
  };
}

/** A station index difference brought into (-n/2, n/2]: the short way round the lap. */
function wrappedIndex(d: number, n: number): number {
  return (((d % n) + n + n / 2) % n) - n / 2;
}
