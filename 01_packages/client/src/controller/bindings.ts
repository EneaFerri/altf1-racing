import type { InputCommand } from '@altf1/shared';

// Keys are KeyboardEvent.code values: physical positions, so WASD works on any layout.

/** Keys held down to drive. Sampled once per tick. */
export const DRIVE_KEYS = {
  throttle: ['KeyW'],
  brake: ['KeyS', 'KeyC'],
  steerLeft: ['KeyA'],
  steerRight: ['KeyD'],
  handbrake: ['Space'],
} as const satisfies Record<string, readonly string[]>;

/** Keys pressed once and delivered to the simulation for exactly one tick. */
export const TICK_TRIGGER_KEYS = {
  reset: ['KeyR'],
} as const satisfies Record<string, readonly string[]>;

export type TickTrigger = keyof typeof TICK_TRIGGER_KEYS;

/** One-shot actions fired on key press. They never reach the simulation. */
export const ACTION_KEYS = {
  toggleTuning: ['F2'],
  toggleDebug: ['F3'],
} as const satisfies Record<string, readonly string[]>;

export type ActionName = keyof typeof ACTION_KEYS;

/** Pure mapping from held keys (and triggers pressed since the last tick) to the player's intent. */
export function inputFromKeys(
  held: ReadonlySet<string>,
  triggers: ReadonlySet<TickTrigger> = new Set(),
): InputCommand {
  const isHeld = (codes: readonly string[]): boolean => codes.some((code) => held.has(code));
  const steerLeft = isHeld(DRIVE_KEYS.steerLeft) ? 1 : 0;
  const steerRight = isHeld(DRIVE_KEYS.steerRight) ? 1 : 0;

  return {
    throttle: isHeld(DRIVE_KEYS.throttle) ? 1 : 0,
    brake: isHeld(DRIVE_KEYS.brake) ? 1 : 0,
    steer: steerRight - steerLeft,
    handbrake: isHeld(DRIVE_KEYS.handbrake),
    reset: triggers.has('reset'),
  };
}
