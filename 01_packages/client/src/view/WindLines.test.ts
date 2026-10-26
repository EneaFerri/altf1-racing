import { describe, expect, it } from 'vitest';
import { windLineOpacity } from './WindLines';

describe('windLineOpacity', () => {
  it('is 0 without a tow and grows in step with it, up to a light maximum', () => {
    expect(windLineOpacity(0)).toBe(0);
    expect(windLineOpacity(0.5)).toBeCloseTo(windLineOpacity(1) / 2);
    expect(windLineOpacity(1)).toBeGreaterThan(0);
    expect(windLineOpacity(1)).toBeLessThanOrEqual(0.6);
    expect(windLineOpacity(1.5)).toBe(windLineOpacity(1));
  });
});
