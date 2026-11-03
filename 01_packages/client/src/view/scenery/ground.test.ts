import { describe, expect, it } from 'vitest';
import { buildTrack, locateOnTrack, MONACO, MONACO_V2 } from '@altf1/shared';
import {
  gridHeightAt,
  GROUND_DROP,
  groundGrid,
  settleUnderRoad,
  trackGroundHeight,
} from './ground';
import { clearance, trackBounds } from './placement';

describe('trackGroundHeight', () => {
  it('is 0 everywhere around a flat track', () => {
    const height = trackGroundHeight(buildTrack(MONACO));
    expect(height({ x: 0, z: 0 })).toBe(0);
    expect(height({ x: 500, z: -300 })).toBe(0);
  });

  const track = buildTrack(MONACO_V2);
  const height = trackGroundHeight(track);

  it('lies just under the road and its run-off on an elevated track', () => {
    for (const s of track.samples.filter((_, i) => i % 50 === 0)) {
      expect(height(s.position)).toBeCloseTo(s.height - GROUND_DROP, 5);
    }
  });

  it('meets the road by the walls and has no steps beyond them', () => {
    const bounds = trackBounds(track, 200);
    let checked = 0;
    for (let x = bounds.minX; x < bounds.maxX; x += 37) {
      for (let z = bounds.minZ; z < bounds.maxZ; z += 37) {
        const p = { x, z };
        if (clearance(track, p) <= 1) continue;
        const h = height(p);
        // Next to the wall: about the road's height there.
        if (clearance(track, p) < 4) {
          expect(Math.abs(h + GROUND_DROP - locateOnTrack(track, p).height)).toBeLessThan(2);
        }
        // Continuous, never a step: one metre further it moves less than a metre (Monaco is
        // steep: up to ~38° between the Casino and the stretches below it).
        expect(Math.abs(height({ x: x + 1, z }) - h)).toBeLessThan(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('settleUnderRoad', () => {
  it('leaves no ground above the road or its run-off (after the Grand Hotel hairpin it rose 4.5 m)', () => {
    const track = buildTrack(MONACO_V2);
    const grid = groundGrid(trackBounds(track, 400), 8, trackGroundHeight(track));
    expect(settleUnderRoad(grid, track)).toBeGreaterThan(0);
    for (const s of track.samples) {
      const reach = s.halfWidth + track.runoffWidth;
      for (let o = -reach; o <= reach; o += 0.7) {
        const h = gridHeightAt(grid, s.position.x + s.normal.x * o, s.position.z + s.normal.z * o)!;
        expect(h).toBeLessThan(s.height);
      }
    }
  });
});
