import { describe, expect, it } from 'vitest';
import { sampleClosedSpline } from './spline';
import { distance, length, vec2 } from './vec2';

describe('sampleClosedSpline', () => {
  const square = [vec2(0, 0), vec2(100, 0), vec2(100, 100), vec2(0, 100)];

  it('samples at roughly even spacing, including the closing segment', () => {
    const { samples } = sampleClosedSpline(square, 2);
    for (let i = 0; i < samples.length; i++) {
      const gap = distance(samples[i]!, samples[(i + 1) % samples.length]!);
      expect(gap).toBeGreaterThan(1.8);
      expect(gap).toBeLessThan(2.2);
    }
  });

  it('passes through the control points', () => {
    const { samples, controlIndices } = sampleClosedSpline(square, 2);
    controlIndices.forEach((sampleIndex, i) => {
      expect(distance(samples[sampleIndex]!, square[i]!)).toBeLessThan(2);
    });
    expect(length(samples[0]!)).toBeLessThan(0.01);
  });
});
