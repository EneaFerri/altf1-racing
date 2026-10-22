import { describe, expect, it } from 'vitest';
import { speedFov } from './CameraRig';

describe('speedFov', () => {
  it('is the base field of view at rest and grows up to base + gain at the reference speed', () => {
    expect(speedFov(70, 10, 0, 70)).toBe(70);
    expect(speedFov(70, 10, 35, 70)).toBe(75);
    expect(speedFov(70, 10, 70, 70)).toBe(80);
    expect(speedFov(70, 10, 90, 70)).toBe(80);
  });

  it('stays at the base when reversing', () => {
    expect(speedFov(70, 10, -8, 70)).toBe(70);
  });
});
