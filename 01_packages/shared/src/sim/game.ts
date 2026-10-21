import { CAR_PARAMS, type CarParams } from '../config/car';
import { FIXED_DT } from '../config/sim';
import type { InputCommand } from '../types/input';
import { createCar, stepCar, type CarState } from './car';

/** Complete simulation state. Plain data only, so it can be copied, compared and sent over the network. */
export interface GameState {
  /** Number of fixed steps simulated so far. */
  readonly tick: number;
  readonly car: CarState;
}

export function createGame(): GameState {
  return { tick: 0, car: createCar() };
}

/** Advances the simulation by exactly one fixed tick. Pure: never mutates `state`. */
export function stepGame(
  state: GameState,
  input: InputCommand,
  params: CarParams = CAR_PARAMS,
): GameState {
  return {
    tick: state.tick + 1,
    car: stepCar(state.car, input, params, FIXED_DT),
  };
}
