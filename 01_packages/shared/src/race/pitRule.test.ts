import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../config/sim';
import { pitPenaltyTicks, requiredStops } from './pitRule';

describe('mandatory pit stops', () => {
  it('requires one stop per 4 laps, rounded down, at most 4', () => {
    const laps = [1, 3, 4, 5, 7, 8, 11, 12, 15, 16, 20, 24];
    expect(laps.map(requiredStops)).toEqual([0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  });

  it('adds 25 s per required stop missing, nothing for extra stops', () => {
    expect(pitPenaltyTicks(0, 3)).toBe(0);
    expect(pitPenaltyTicks(0, 5)).toBe(25 * TICK_RATE);
    expect(pitPenaltyTicks(1, 8)).toBe(25 * TICK_RATE);
    expect(pitPenaltyTicks(0, 24)).toBe(100 * TICK_RATE);
    expect(pitPenaltyTicks(2, 8)).toBe(0);
    expect(pitPenaltyTicks(5, 8)).toBe(0);
  });
});
