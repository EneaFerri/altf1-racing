import type { InputCommand } from '@altf1/shared';

// Keys are KeyboardEvent.code values: physical positions, so WASD works on any layout.

/** Keys held down to drive. Sampled once per tick. */
export const DRIVE_KEYS = {
  throttle: ['KeyW'],
  /** Held longer = harder braking. */
  brake: ['Space'],
  /** Brakes while rolling forward, then drives backwards. */
  reverse: ['KeyS'],
  steerLeft: ['KeyA'],
  steerRight: ['KeyD'],
} as const satisfies Record<string, readonly string[]>;

/** Keys held down to change the view. Read every frame; they never reach the simulation. */
export const VIEW_KEYS = {
  /** Look behind the car while held. */
  lookBack: ['KeyZ'],
} as const satisfies Record<string, readonly string[]>;

export type ViewKey = keyof typeof VIEW_KEYS;

/** Keys pressed once and delivered to the simulation for exactly one tick. */
export const TICK_TRIGGER_KEYS = {
  reset: ['KeyR'],
} as const satisfies Record<string, readonly string[]>;

export type TickTrigger = keyof typeof TICK_TRIGGER_KEYS;

/** One-shot actions fired on key press. They never reach the simulation. */
export const ACTION_KEYS = {
  toggleTuning: ['F2'],
  toggleDebug: ['F3'],
  toggleCamera: ['KeyV'],
  /** Bot level: Off → Easy → Medium → Hard → Off. */
  cycleBot: ['KeyB'],
  /** Grand Prix manager: move the GP on (start it, end qualifying). */
  confirm: ['Enter', 'NumpadEnter'],
  /** Grand Prix manager on the grid: start the race over the first, second or third distance. */
  choice1: ['Digit1', 'Numpad1'],
  choice2: ['Digit2', 'Numpad2'],
  choice3: ['Digit3', 'Numpad3'],
  /** Leave the race and go back to the track menu. */
  backToMenu: ['Escape'],
  /** Dev only: park the dummy car in front of the player. */
  placeDummy: ['F4'],
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
    reverse: isHeld(DRIVE_KEYS.reverse) ? 1 : 0,
    steer: steerRight - steerLeft,
    reset: triggers.has('reset'),
  };
}
