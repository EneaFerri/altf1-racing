import { describe, expect, it } from 'vitest';
import { FIXED_DT, TICK_RATE } from './sim';

describe('sim config', () => {
  it('FIXED_DT matches TICK_RATE', () => {
    expect(FIXED_DT * TICK_RATE).toBeCloseTo(1);
  });
});
