import type { InputCommand } from '../types/input';

/** Complete simulation state. Plain data only, so it can be copied, compared and sent over the network. */
export interface GameState {
  /** Number of fixed steps simulated so far. */
  readonly tick: number;
}

export function createGame(): GameState {
  return { tick: 0 };
}

/** Advances the simulation by exactly one fixed tick. Pure: never mutates `state`. */
export function stepGame(state: GameState, _input: InputCommand): GameState {
  return { tick: state.tick + 1 };
}
