import { requiredStops } from '../race/pitRule';
import type { Track } from '../track/types';

/**
 * When a bot makes its mandatory pit stops in a race over `raceLaps` laps: stop `j` (1-based) is
 * due once it has completed `floor(j · raceLaps / (stops + 1))` laps (at least 1), so the stops
 * split the race into stints of about the same length (8 laps, 2 stops: after laps 2 and 5).
 * It then takes the pit lane at the next pit entry. Pure.
 */
export function pitSchedule(raceLaps: number): number[] {
  const stops = requiredStops(raceLaps);
  return Array.from({ length: stops }, (_, i) =>
    Math.max(1, Math.floor(((i + 1) * raceLaps) / (stops + 1))),
  );
}

/** Whether a bot that has completed `lapsDone` laps and made `stopsMade` stops still owes one now. */
export function pitDue(schedule: readonly number[], lapsDone: number, stopsMade: number): boolean {
  return stopsMade < schedule.filter((after) => lapsDone >= after).length;
}

/**
 * Whether a car at main-loop `progress` (m from the line) may switch between its race plan and its
 * pit plan: only where both roads are the same, outside the stretch the pit lane runs beside
 * (from its entry to its exit, with `margin` m either side). `track` built with its pit lane.
 */
export function canSwitchPlan(track: Track, progress: number, margin = 30): boolean {
  const branch = track.routes.find((route) => route.pit)?.branch;
  if (!branch) return true;
  const { mainFrom, mainTo, mainLength } = branch;
  const along = (d: number): number =>
    (((d - (mainFrom - margin)) % mainLength) + mainLength) % mainLength;
  const span = along(mainTo + margin);
  return along(progress) > span;
}
