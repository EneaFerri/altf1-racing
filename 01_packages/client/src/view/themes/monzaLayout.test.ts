import { describe, expect, it } from 'vitest';
import { buildTrack, locateOnTrack, MONZA } from '@altf1/shared';
import {
  alongTrack,
  clearance,
  footprintBox,
  fromTrack,
  insidePolygon,
  scatter,
} from '../scenery/placement';
import {
  MONZA_OVAL,
  MONZA_OVAL_WIDTH,
  MONZA_PIT_BUILDINGS,
  MONZA_PIT_LANE,
  MONZA_STANDS,
  MONZA_WOODS,
} from './monzaLayout';

const track = buildTrack(MONZA);
const pitLane = alongTrack(track, MONZA_PIT_LANE.path, 4);
/** Distance from `p` to the pit lane's centreline (m). */
const toPitLane = (p: { x: number; z: number }): number =>
  Math.min(...pitLane.map((q) => Math.hypot(p.x - q.x, p.z - q.z)));

describe('Monza scenery (generated from OpenStreetMap)', () => {
  it('has the real grandstands, all beyond the walls and clear of the pit lane', () => {
    expect(MONZA_STANDS.length).toBeGreaterThan(30);
    expect(MONZA_STANDS.map((s) => s.name)).toContain('Tribuna Centrale');
    for (const stand of MONZA_STANDS) {
      for (const spot of stand.footprint) {
        const p = fromTrack(track, spot);
        expect(clearance(track, p)).toBeGreaterThan(2);
        expect(toPitLane(p)).toBeGreaterThan(MONZA_PIT_LANE.width / 2);
      }
    }
  });

  it('has the pit lane behind the wall on the inside of the main straight, buildings behind it', () => {
    for (const p of pitLane) {
      expect(clearance(track, p)).toBeGreaterThan(MONZA_PIT_LANE.width / 2);
      // Inside of a clockwise lap = the driver's right.
      expect(locateOnTrack(track, p).lateral).toBeGreaterThan(0);
    }
    expect(MONZA_PIT_BUILDINGS.length).toBeGreaterThan(0);
    for (const building of MONZA_PIT_BUILDINGS) {
      const box = footprintBox(track, building);
      expect(clearance(track, box.front)).toBeGreaterThan(MONZA_PIT_LANE.width);
    }
  });

  it('puts the old oval on a bridge where it crosses the track, never on the track', () => {
    let bridged = 0;
    for (const piece of MONZA_OVAL) {
      piece.points.forEach((p, i) => {
        if (clearance(track, p) < 0) {
          expect(piece.height[i]).toBeGreaterThan(6);
          bridged++;
        } else if (piece.height[i]! < 1) {
          expect(clearance(track, p)).toBeGreaterThan(MONZA_OVAL_WIDTH / 2);
        }
      });
    }
    // The Sopraelevata Sud passes over the Serraglio straight.
    expect(bridged).toBeGreaterThan(3);
  });

  it('plants trees in the woods, off the track', () => {
    const wood = MONZA_WOODS.reduce((a, b) => (a.length > b.length ? a : b));
    const xs = wood.map((p) => p.x);
    const zs = wood.map((p) => p.z);
    const area = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
    const trees = scatter(track, 50, area, { seed: 1, margin: 8, spacing: 9, inside: wood });
    expect(trees.length).toBeGreaterThan(0);
    for (const p of trees) {
      expect(insidePolygon(p, wood)).toBe(true);
      expect(clearance(track, p)).toBeGreaterThanOrEqual(8);
    }
  });
});
