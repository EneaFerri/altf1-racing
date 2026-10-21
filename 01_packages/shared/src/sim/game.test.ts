import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../types/input';
import { createGame, stepGame } from './game';

describe('stepGame', () => {
  it('advances the tick counter by one', () => {
    const next = stepGame(createGame(), NEUTRAL_INPUT);
    expect(next.tick).toBe(1);
  });

  it('does not mutate the previous state', () => {
    const prev = createGame();
    stepGame(prev, NEUTRAL_INPUT);
    expect(prev.tick).toBe(0);
  });
});
