/**
 * One frame of player intent, produced by the Controller and consumed by the Model.
 * Kept as plain serializable data so it can be sent over the network later.
 */
export interface InputCommand {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (full left) .. 1 (full right) */
  steer: number;
  handbrake: boolean;
  /** True for exactly one tick when the player asks to be put back on the track. */
  reset: boolean;
}

export const NEUTRAL_INPUT: Readonly<InputCommand> = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
};
