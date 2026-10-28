import { describe, expect, it } from 'vitest';
import { fitToCanvas } from './minimapFit';

describe('fitToCanvas', () => {
  const bounds = { minX: -100, maxX: 300, minZ: 0, maxZ: 200 };
  const map = fitToCanvas(bounds, 180, 10);

  it('fits the wider axis between the paddings and centres the other', () => {
    expect(map(-100, 0).u).toBeCloseTo(10);
    expect(map(300, 0).u).toBeCloseTo(170);
    // 200 m deep at 0.4 px/m = 80 px, centred in 180.
    expect(map(0, 0).v).toBeCloseTo(50);
    expect(map(0, 200).v).toBeCloseTo(130);
  });

  it('keeps the shape: one scale for both axes, +x right and +z down', () => {
    const a = map(0, 0);
    const b = map(100, 100);
    expect(b.u - a.u).toBeCloseTo(b.v - a.v);
    expect(b.u).toBeGreaterThan(a.u);
    expect(b.v).toBeGreaterThan(a.v);
  });
});
