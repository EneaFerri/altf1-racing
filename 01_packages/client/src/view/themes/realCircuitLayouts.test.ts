import { describe, expect, it } from 'vitest';
import { BARCELONA, buildTrack, locateOnTrack, MONZA, type TrackDefinition } from '@altf1/shared';
import {
  alongTrack,
  clearance,
  footprintBox,
  fromTrack,
  insidePolygon,
  scatter,
} from '../scenery/placement';
import {
  BARCELONA_OVAL,
  BARCELONA_OVAL_WIDTH,
  BARCELONA_PIT_BUILDINGS,
  BARCELONA_PIT_LANE,
  BARCELONA_STANDS,
  BARCELONA_WOODS,
} from './barcelonaLayout';
import {
  MONZA_OVAL,
  MONZA_OVAL_WIDTH,
  MONZA_PIT_BUILDINGS,
  MONZA_PIT_LANE,
  MONZA_STANDS,
  MONZA_WOODS,
} from './monzaLayout';
import type { RealCircuitScenery } from './realCircuitTheme';

/** Every real circuit's generated scenery, with what it must contain. */
const CIRCUITS: readonly {
  readonly definition: TrackDefinition;
  readonly scenery: RealCircuitScenery;
  readonly minStands: number;
  readonly mainStand: string;
}[] = [
  {
    definition: MONZA,
    scenery: {
      stands: MONZA_STANDS,
      pitLane: MONZA_PIT_LANE,
      pitBuildings: MONZA_PIT_BUILDINGS,
      woods: MONZA_WOODS,
      oval: MONZA_OVAL,
      ovalWidth: MONZA_OVAL_WIDTH,
    },
    minStands: 30,
    mainStand: 'Tribuna Centrale',
  },
  {
    definition: BARCELONA,
    scenery: {
      stands: BARCELONA_STANDS,
      pitLane: BARCELONA_PIT_LANE,
      pitBuildings: BARCELONA_PIT_BUILDINGS,
      woods: BARCELONA_WOODS,
      oval: BARCELONA_OVAL,
      ovalWidth: BARCELONA_OVAL_WIDTH,
    },
    minStands: 12,
    mainStand: 'Graderia principal',
  },
];

describe.each(CIRCUITS.map((c) => [c.definition.name, c] as const))(
  '%s scenery (generated from OpenStreetMap)',
  (_name, { definition, scenery, minStands, mainStand }) => {
    const track = buildTrack(definition);
    const pitLane = alongTrack(track, scenery.pitLane.path, 4);
    /** Distance from `p` to the pit lane's centreline (m). */
    const toPitLane = (p: { x: number; z: number }): number =>
      Math.min(...pitLane.map((q) => Math.hypot(p.x - q.x, p.z - q.z)));

    it('has the real grandstands, all beyond the walls and clear of the pit lane', () => {
      expect(scenery.stands.length).toBeGreaterThan(minStands);
      expect(scenery.stands.map((s) => s.name)).toContain(mainStand);
      for (const stand of scenery.stands) {
        for (const spot of stand.footprint) {
          const p = fromTrack(track, spot);
          expect(clearance(track, p)).toBeGreaterThan(2);
          expect(toPitLane(p)).toBeGreaterThan(scenery.pitLane.width / 2);
        }
      }
    });

    it('has the pit lane behind the wall on the inside of the main straight, buildings behind it', () => {
      for (const p of pitLane) {
        expect(clearance(track, p)).toBeGreaterThan(scenery.pitLane.width / 2);
        // Inside of a clockwise lap = the driver's right.
        expect(locateOnTrack(track, p).lateral).toBeGreaterThan(0);
      }
      expect(scenery.pitBuildings.length).toBeGreaterThan(0);
      for (const building of scenery.pitBuildings) {
        const box = footprintBox(track, building);
        expect(clearance(track, box.front)).toBeGreaterThan(scenery.pitLane.width);
      }
    });

    it('has a pit lane path running along the lap, never back', () => {
      const ats = scenery.pitLane.path.map(([at]) => at);
      ats.slice(1).forEach((at, i) => {
        const step = ((((at - ats[i]!) % 1) + 1.5) % 1) - 0.5;
        expect(step).toBeGreaterThanOrEqual(0);
      });
    });

    it('plants trees in the woods, off the track', () => {
      const wood = scenery.woods.reduce((a, b) => (a.length > b.length ? a : b));
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
  },
);

describe('Monza scenery', () => {
  it('puts the old oval on a bridge where it crosses the track, never on the track', () => {
    const track = buildTrack(MONZA);
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
});
