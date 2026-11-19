import { GRAND_PRIX } from '../config/grandPrix';
import { TICK_RATE } from '../config/sim';

/** Pit stops a race over `laps` laps requires: one per 4 laps, rounded down, at most 4. */
export function requiredStops(laps: number): number {
  const { lapsPerStop, maxRequired } = GRAND_PRIX.pitRule;
  return Math.min(maxRequired, Math.floor(Math.max(0, laps) / lapsPerStop));
}

/**
 * The time penalty (ticks) of a driver who made `stops` pit stops over `laps` completed laps: 25 s
 * per required stop missing, 0 once they made enough.
 */
export function pitPenaltyTicks(stops: number, laps: number): number {
  const missing = Math.max(0, requiredStops(laps) - stops);
  return missing * GRAND_PRIX.pitRule.penaltySeconds * TICK_RATE;
}
