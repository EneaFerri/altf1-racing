import type { TyreCompound } from '../config/tyres';

/**
 * One frame of player intent, produced by the Controller and consumed by the Model.
 * Kept as plain serializable data so it can be sent over the network later.
 */
export interface InputCommand {
  /** 0..1 */
  throttle: number;
  /** 0..1. Brakes to a stop, never reverses; how long it is held sets the pressure (see stepCar). */
  brake: number;
  /** 0..1. Brakes like `brake` while rolling forward, then drives backwards. */
  reverse: number;
  /** -1 (full left) .. 1 (full right) */
  steer: number;
  /** True for exactly one tick when the player asks to be put back on the track. */
  reset: boolean;
  /**
   * Stopped in its box (the Grand Prix): the compound its driver chose (keys 1 / 2), for exactly
   * one tick; fitted new at once. Ignored anywhere else. Absent: no choice.
   */
  compound?: TyreCompound;
}

export const NEUTRAL_INPUT: Readonly<InputCommand> = {
  throttle: 0,
  brake: 0,
  reverse: 0,
  steer: 0,
  reset: false,
};
