import type { SlipstreamParams } from '../config/slipstream';
import { wrapAngle } from '../math/angle';
import { dot, forward, right, sub } from '../math/vec2';
import type { CarState } from './car';

/** What the tow does to a car for one tick. */
export interface SlipstreamEffect {
  /** Multiplier on air drag (1 = no tow). */
  readonly dragScale: number;
  /** Extra forward push while on throttle (m/s²). */
  readonly towAccel: number;
}

export const NO_SLIPSTREAM: SlipstreamEffect = { dragScale: 1, towAccel: 0 };

/**
 * How much `car` is towed (0..1), the strongest wake among `cars`. A wake is stronger the closer
 * the car is behind the leader (full at `fullGap`, none past `range`), the nearer to its axis and
 * the faster the leader goes (none below `minSpeed`). See 01_docs/physics.md#slipstream.
 */
export function slipstreamFactor(
  car: CarState,
  cars: readonly CarState[],
  p: SlipstreamParams,
): number {
  let best = 0;
  for (const leader of cars) {
    if (leader.id === car.id) continue;
    if (Math.abs(wrapAngle(car.heading - leader.heading)) > p.maxHeadingDiff) continue;

    const offset = sub(car.position, leader.position);
    const behind = -dot(offset, forward(leader.heading));
    if (behind <= 0) continue; // alongside or ahead: no wake
    const lateral = Math.abs(dot(offset, right(leader.heading)));
    const leaderSpeed = dot(leader.velocity, forward(leader.heading));

    const factor =
      fade(behind, p.range, p.fullGap) *
      fade(lateral, p.halfWidth, 0) *
      fade(leaderSpeed, p.minSpeed, p.fullSpeed);
    best = Math.max(best, factor);
  }
  return best;
}

export function slipstreamEffect(factor: number, p: SlipstreamParams): SlipstreamEffect {
  return { dragScale: 1 - factor * p.dragCut, towAccel: factor * p.towAccel };
}

/** Linear 0..1: 0 at `zero`, 1 at `one`, clamped (works whichever way round they are). */
function fade(value: number, zero: number, one: number): number {
  return Math.min(1, Math.max(0, (value - zero) / (one - zero)));
}
