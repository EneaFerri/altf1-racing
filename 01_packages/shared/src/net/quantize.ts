import type { GameState } from '../sim/game';

/**
 * Decimals a snapshot keeps of every number that isn't whole (0.1 mm, 0.1 mrad, …): far below
 * anything visible, and half the digits of a full double. See 01_docs/multiplayer.md#rooms.
 */
export const SNAPSHOT_DECIMALS = 4;

const SCALE = 10 ** SNAPSHOT_DECIMALS;

/**
 * The state with every number rounded to SNAPSHOT_DECIMALS. The server applies it to its own
 * room before each snapshot, so the snapshot is exactly the state it carries on from and the
 * client's prediction stays identical to it. Pure; rounding twice changes nothing.
 */
export function quantizeState(state: GameState): GameState {
  return round(state) as GameState;
}

function round(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isInteger(value) || !Number.isFinite(value)
      ? value
      : Math.round(value * SCALE) / SCALE;
  }
  if (Array.isArray(value)) return value.map(round);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) out[key] = round(field);
    return out;
  }
  return value;
}
