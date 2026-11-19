import { describe, expect, it } from 'vitest';
import { CustomLaps } from './customLaps';

describe('CustomLaps', () => {
  it('opens at 12, moves within 1–24, and resets', () => {
    const laps = new CustomLaps();
    laps.step(1);
    expect(laps.value).toBeNull(); // not open yet
    laps.open();
    expect(laps.value).toBe(12);
    for (let i = 0; i < 30; i++) laps.step(1);
    expect(laps.value).toBe(24);
    for (let i = 0; i < 30; i++) laps.step(-1);
    expect(laps.value).toBe(1);
    laps.open();
    expect(laps.value).toBe(1); // kept
    laps.reset();
    expect(laps.value).toBeNull();
  });
});
