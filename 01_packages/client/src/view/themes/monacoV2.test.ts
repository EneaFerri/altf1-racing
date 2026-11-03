import { describe, expect, it } from 'vitest';
import { buildTrack, locateOnTrack, MONACO_V2 } from '@altf1/shared';
import { elevatedGround, gridHeightAt, SEA_FLOOR } from '../scenery/ground';
import { clearance, insidePolygon } from '../scenery/placement';
import { MONACO_CITY, MONACO_SEA, MONACO_TUNNEL } from './monacoLayout';
import { MONACO_V2_THEME } from './monacoV2';

// Monaco v2's town on the real land (Phase 3d): the ground the game draws, and what stands on it.
const track = buildTrack(MONACO_V2);
const grid = elevatedGround(track, MONACO_V2_THEME.groundHeight!(track));
const ground = (p: { x: number; z: number }): number => gridHeightAt(grid, p.x, p.z) ?? SEA_FLOOR;

describe('Monaco v2 on the real land', () => {
  it('climbs from the harbour to the slopes above the town', () => {
    const heights = Array.from(grid.heights);
    expect(Math.min(...heights)).toBeLessThanOrEqual(SEA_FLOOR);
    expect(Math.max(...heights)).toBeGreaterThan(100);
  });

  it('keeps the ground under the road and its run-off everywhere', () => {
    for (const s of track.samples) {
      for (const o of [-1, -0.5, 0, 0.5, 1]) {
        const reach = o * (s.halfWidth + track.runoffWidth);
        const h = gridHeightAt(
          grid,
          s.position.x + s.normal.x * reach,
          s.position.z + s.normal.z * reach,
        )!;
        expect(h).toBeLessThan(s.height);
      }
    }
  });

  it('puts the sea floor under the water, past the quays', () => {
    let wet = 0;
    for (let r = 0; r < grid.rows; r += 3) {
      for (let c = 0; c < grid.cols; c += 3) {
        const p = { x: grid.minX + c * grid.cell, z: grid.minZ + r * grid.cell };
        if (clearance(track, p) < 5 || !MONACO_SEA.some((ring) => insidePolygon(p, ring))) continue;
        expect(grid.heights[r * grid.cols + c]).toBeLessThanOrEqual(SEA_FLOOR);
        wet++;
      }
    }
    expect(wet).toBeGreaterThan(100);
  });

  it('stands every building on the ground (never floating), those on the tunnel on its roof', () => {
    let buried = 0;
    let slope = 0;
    for (const b of MONACO_CITY) {
      const under = b.points.map(ground);
      if (b.base > 0) {
        // On the tunnel's roof: as high over the road as on flat Monaco.
        const road = locateOnTrack(track, b.points[0]!).height;
        expect(MONACO_TUNNEL!.height + road).toBeGreaterThan(road + 6);
        continue;
      }
      // As the theme stands it: from its lowest corner, at least a floor above its uphill side.
      const base = Math.min(...under);
      const height = Math.max(b.height, Math.max(...under) - base + 3.2);
      if (Math.max(...under) > base + height - 3) buried++;
      // Without that rule, buildings between two stretches at different heights would be buried.
      if (Math.max(...under) > base + b.height) slope++;
    }
    expect(buried).toBe(0);
    expect(slope).toBeGreaterThan(0);
  });
});
