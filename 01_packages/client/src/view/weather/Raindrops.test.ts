import { describe, expect, it } from 'vitest';
import { dropPosition, RAINDROP_PARAMS } from './Raindrops';

const p = RAINDROP_PARAMS;
const camera = { x: 120, y: 3, z: -40 };
const base = { x: 10, y: 20, z: 30 };

describe('dropPosition', () => {
  it('always stays in the box round the camera', () => {
    for (const time of [0, 0.3, 1.7, 12, 333]) {
      const at = dropPosition(base, time, camera, p);
      expect(Math.abs(at.x - camera.x)).toBeLessThanOrEqual(p.width / 2);
      expect(Math.abs(at.z - camera.z)).toBeLessThanOrEqual(p.width / 2);
      expect(at.y).toBeGreaterThanOrEqual(camera.y - p.below);
      expect(at.y).toBeLessThanOrEqual(camera.y - p.below + p.height);
    }
  });

  it('falls at the rain speed, drifting a little with the wind', () => {
    const a = dropPosition(base, 0, camera, p);
    const b = dropPosition(base, 0.1, camera, p);
    expect(a.y - b.y).toBeCloseTo(p.speed * 0.1);
    expect(b.x - a.x).toBeCloseTo(p.windX * p.speed * 0.1);
  });

  it('comes back from the top once below the box', () => {
    const fallen = dropPosition(base, p.height / p.speed, camera, p);
    expect(fallen.y).toBeCloseTo(dropPosition(base, 0, camera, p).y);
  });
});

describe('RAINDROP_PARAMS', () => {
  it('stays light and keeps the eye clear', () => {
    expect(p.count).toBeLessThanOrEqual(2000);
    expect(p.opacity).toBeLessThanOrEqual(1);
    expect(p.nearClear).toBeGreaterThan(0);
  });
});
