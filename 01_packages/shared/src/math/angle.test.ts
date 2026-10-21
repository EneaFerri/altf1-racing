import { describe, expect, it } from 'vitest';
import { lerpAngle, moveToward, wrapAngle } from './angle';

describe('wrapAngle', () => {
  it('keeps angles already in range', () => {
    expect(wrapAngle(1)).toBeCloseTo(1);
  });

  it('wraps angles beyond PI into (-PI, PI]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5);
  });
});

describe('lerpAngle', () => {
  it('takes the short way across the PI boundary', () => {
    const mid = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(mid)).toBeCloseTo(Math.PI);
  });
});

describe('moveToward', () => {
  it('moves by at most maxDelta', () => {
    expect(moveToward(0, 10, 3)).toBe(3);
    expect(moveToward(0, -10, 3)).toBe(-3);
  });

  it('does not overshoot', () => {
    expect(moveToward(9, 10, 3)).toBe(10);
  });
});
