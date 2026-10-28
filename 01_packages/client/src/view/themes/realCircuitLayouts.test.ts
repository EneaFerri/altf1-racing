import { describe, expect, it } from 'vitest';
import {
  BARCELONA,
  buildTrack,
  locateOnTrack,
  MONACO,
  MONZA,
  type TrackDefinition,
} from '@altf1/shared';
import {
  alongTrack,
  clearance,
  fitsBeside,
  footprintBox,
  fromTrack,
  insidePolygon,
  mooredBoats,
  scatter,
  standPieces,
} from '../scenery/placement';
import { GRANDSTAND_REACH } from '../scenery/buildings';
import {
  BARCELONA_OVAL,
  BARCELONA_OVAL_WIDTH,
  BARCELONA_PIT_BUILDINGS,
  BARCELONA_PIT_LANE,
  BARCELONA_STANDS,
  BARCELONA_WOODS,
} from './barcelonaLayout';
import {
  MONACO_CITY,
  MONACO_ISLANDS,
  MONACO_OVAL,
  MONACO_OVAL_WIDTH,
  MONACO_PALMS,
  MONACO_PIERS,
  MONACO_PIT_BUILDINGS,
  MONACO_PIT_LANE,
  MONACO_POOLS,
  MONACO_SEA,
  MONACO_STANDS,
  MONACO_TUNNEL,
  MONACO_WOODS,
} from './monacoLayout';
import {
  MONZA_OVAL,
  MONZA_OVAL_WIDTH,
  MONZA_PIT_BUILDINGS,
  MONZA_PIT_LANE,
  MONZA_STANDS,
  MONZA_WOODS,
} from './monzaLayout';
import { STAND_PIECE, type RealCircuitScenery } from './realCircuitTheme';

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
  {
    definition: MONACO,
    scenery: {
      stands: MONACO_STANDS,
      pitLane: MONACO_PIT_LANE,
      pitBuildings: MONACO_PIT_BUILDINGS,
      woods: MONACO_WOODS,
      oval: MONACO_OVAL,
      ovalWidth: MONACO_OVAL_WIDTH,
    },
    // Placed by hand (temporary stands are not in OSM).
    minStands: 2,
    mainStand: 'Tribune T (Piscine, Rascasse)',
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

    it('draws every grandstand clear of the track, the main one included', () => {
      for (const stand of scenery.stands) {
        const pieces = standPieces(track, stand.footprint, GRANDSTAND_REACH, STAND_PIECE);
        if (stand.name === mainStand) expect(pieces.length).toBeGreaterThan(0);
        for (const box of pieces) expect(fitsBeside(track, box, GRANDSTAND_REACH)).toBe(true);
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

describe('Monaco town (generated from OpenStreetMap)', () => {
  const track = buildTrack(MONACO);
  const atOf = (p: { x: number; z: number }): number =>
    locateOnTrack(track, p).distance / track.length;
  const inTunnel = (at: number): boolean =>
    !!MONACO_TUNNEL && at >= MONACO_TUNNEL.from && at <= MONACO_TUNNEL.to;

  it('has its town: hundreds of buildings with real heights, a few on the tunnel roof', () => {
    expect(MONACO_CITY.length).toBeGreaterThan(200);
    expect(Math.max(...MONACO_CITY.map((b) => b.height))).toBeGreaterThan(50);
    const onRoof = MONACO_CITY.filter((b) => b.base > 0);
    expect(onRoof.length).toBeGreaterThan(0);
    for (const b of onRoof) expect(b.base).toBe(MONACO_TUNNEL!.height);
  });

  it('keeps every building beyond the walls, except those standing on the tunnel', () => {
    for (const b of MONACO_CITY) {
      for (const p of b.points) {
        if (b.base > 0) {
          if (clearance(track, p) < 0) expect(inTunnel(atOf(p))).toBe(true);
        } else expect(clearance(track, p)).toBeGreaterThan(0.9);
      }
    }
  });

  it('has the tunnel where it really is, under the Fairmont along the sea (~1.35–1.8 km of 3.3)', () => {
    expect(MONACO_TUNNEL!.from).toBeGreaterThan(0.38);
    expect(MONACO_TUNNEL!.to).toBeLessThan(0.6);
    expect(MONACO_TUNNEL!.to - MONACO_TUNNEL!.from).toBeGreaterThan(0.1);
  });

  it('never puts the sea, islands, piers or pools on the track, nor palms', () => {
    for (const s of track.samples) {
      for (const ring of [...MONACO_SEA, ...MONACO_ISLANDS, ...MONACO_POOLS]) {
        expect(insidePolygon(s.position, ring)).toBe(false);
      }
    }
    for (const pier of MONACO_PIERS)
      for (const p of pier.points) expect(clearance(track, p)).toBeGreaterThan(0.9);
    for (const p of MONACO_PALMS) expect(clearance(track, p)).toBeGreaterThanOrEqual(3.9);
    expect(MONACO_PIERS.length).toBeGreaterThan(10);
    expect(MONACO_PALMS.length).toBeGreaterThan(50);
  });

  it('has its landmarks on their real footprints: the Casino and the Chapelle Sainte-Dévote', () => {
    expect(MONACO_CITY.filter((b) => b.landmark === 'casino')).toHaveLength(1);
    expect(MONACO_CITY.filter((b) => b.landmark === 'chapel')).toHaveLength(1);
  });

  it('moors hundreds of yachts on the water, off the track, none overlapping', () => {
    const boats = mooredBoats(MONACO_PIERS, MONACO_SEA, (p) => clearance(track, p) > 3, 17);
    expect(boats.length).toBeGreaterThan(150);
    for (const b of boats) {
      expect(MONACO_SEA.some((ring) => insidePolygon(b.at, ring))).toBe(true);
      expect(clearance(track, b.at)).toBeGreaterThan(3);
    }
    // Centres at least half a beam apart (the overlap check works).
    for (let i = 0; i < boats.length; i++) {
      for (let j = i + 1; j < boats.length; j++) {
        const d = Math.hypot(boats[i]!.at.x - boats[j]!.at.x, boats[i]!.at.z - boats[j]!.at.z);
        expect(d).toBeGreaterThan(1.5);
      }
    }
  });
});
