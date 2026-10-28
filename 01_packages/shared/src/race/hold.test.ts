import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../types/input';
import { HELD, heldInputs, lightsOn, startHold } from './hold';

const THROTTLE = { p1: { ...NEUTRAL_INPUT, throttle: 1 } };

describe('start hold', () => {
  it('neutralises every input until lights out, and none without a hold', () => {
    const hold = { lightsFrom: 100, until: 400 };
    expect(heldInputs(THROTTLE, 399, hold)).toEqual({});
    expect(heldInputs(THROTTLE, 400, hold)).toBe(THROTTLE);
    expect(heldInputs(THROTTLE, 10 ** 9, HELD)).toEqual({});
    expect(heldInputs(THROTTLE, 0, null)).toBe(THROTTLE);
  });

  it('lights five reds a second apart after a second, out 0.2–1 s after the fifth', () => {
    expect(startHold(1000, 0)).toEqual({ lightsFrom: 1060, until: 1060 + 240 + 12 });
    expect(startHold(1000, 0.999).until).toBe(1060 + 240 + 60);
    const hold = startHold(1000, 0.5);
    expect(
      [1059, 1060, 1119, 1120, 1300, hold.until - 1, hold.until].map((t) => lightsOn(t, hold)),
    ).toEqual([0, 1, 1, 2, 5, 5, 0]);
    expect(lightsOn(5000, HELD)).toBe(0); // held on the grid: no lights yet
  });
});
