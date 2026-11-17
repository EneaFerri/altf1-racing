import { describe, expect, it } from 'vitest';
import { buildTrack, locateOnTrack, MONACO, MONZA } from '@altf1/shared';
import {
  gridHeightAt,
  GROUND_DROP,
  groundGrid,
  LAKE_DEPTH,
  lakeLevel,
  settleUnderRoad,
  SHORE_BAND,
  trackGroundHeight,
  withLakes,
} from './ground';
import { clearance, trackBounds } from './placement';

describe('trackGroundHeight', () => {
  it('is 0 everywhere around a flat track', () => {
    const height = trackGroundHeight(buildTrack(MONZA));
    expect(height({ x: 0, z: 0 })).toBe(0);
    expect(height({ x: 500, z: -300 })).toBe(0);
  });

  const track = buildTrack(MONACO);
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
    const track = buildTrack(MONACO);
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

describe('lakes on the land', () => {
  // A square lake on a slope rising 0.1 m per metre towards +x: its shore from 700 to 710 m.
  const dry = (p: { x: number; z: number }): number => 700 + p.x * 0.1;
  const lake = [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 100 },
    { x: 0, z: 100 },
  ];
  const level = lakeLevel(dry, lake);
  const ground = withLakes(dry, [lake]);

  it('puts the water at the median of its shore, not at its lowest point', () => {
    expect(level).toBeGreaterThan(703);
    expect(level).toBeLessThan(707);
  });

  it('lays the bed under the water inside the lake', () => {
    for (const p of [
      { x: 10, z: 50 },
      { x: 90, z: 10 },
    ]) {
      expect(ground(p)).toBeCloseTo(level - LAKE_DEPTH, 5);
    }
  });

  it('eases the bank to the water level, and leaves the land alone past the band', () => {
    // At the shore, the water's level on either side (never above it, nor a pit under the bank).
    expect(ground({ x: -0.01, z: 50 })).toBeCloseTo(level, 1);
    expect(ground({ x: 100.01, z: 50 })).toBeCloseTo(level, 1);
    // Continuous outwards, then the land itself.
    for (let d = 0; d < SHORE_BAND + 10; d += 1) {
      const step = ground({ x: 100 + d + 1, z: 50 }) - ground({ x: 100 + d, z: 50 });
      expect(Math.abs(step)).toBeLessThan(1);
    }
    expect(ground({ x: 100 + SHORE_BAND + 5, z: 50 })).toBe(
      dry({ x: 100 + SHORE_BAND + 5, z: 50 }),
    );
  });
});
