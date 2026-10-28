import { GRAND_PRIX } from '../config/grandPrix';
import { TICK_RATE } from '../config/sim';
import type { InputMap } from '../sim/game';

/**
 * Cars held on the grid: every input is neutral while the tick is below `until` (lights out).
 * `lightsFrom` = tick the first red light comes on; null = held with no start under way (the
 * grid waiting for the manager). The server's room and the client's prediction both apply it, so
 * the start is predicted exactly. See 01_docs/multiplayer.md#grand-prix.
 */
export interface StartHold {
  readonly lightsFrom: number | null;
  readonly until: number;
}

/** Held until further notice (JSON-safe, unlike Infinity). */
export const HELD: StartHold = { lightsFrom: null, until: Number.MAX_SAFE_INTEGER };

/** The inputs for the step from `tick`: none (all neutral) while `hold` holds, else `inputs`. */
export function heldInputs(inputs: InputMap, tick: number, hold: StartHold | null): InputMap {
  return hold && tick < hold.until ? {} : inputs;
}

/**
 * The start from `now`: the first light after `lights.delay`, one more every `lights.interval`,
 * lights out a random 0.2–1 s (`random` in [0, 1)) after the last one came on.
 */
export function startHold(now: number, random: number): StartHold {
  const { count, interval, delay, outMin, outMax } = GRAND_PRIX.lights;
  const lightsFrom = now + Math.round(delay * TICK_RATE);
  const lastOn = lightsFrom + (count - 1) * Math.round(interval * TICK_RATE);
  return {
    lightsFrom,
    until: lastOn + Math.round((outMin + (outMax - outMin) * random) * TICK_RATE),
  };
}

/** Red lights on at `tick` (0 before the first and from lights out on). */
export function lightsOn(tick: number, hold: StartHold | null): number {
  if (!hold || hold.lightsFrom === null || tick < hold.lightsFrom || tick >= hold.until) return 0;
  const { count, interval } = GRAND_PRIX.lights;
  return Math.min(
    count,
    Math.floor((tick - hold.lightsFrom) / Math.round(interval * TICK_RATE)) + 1,
  );
}
