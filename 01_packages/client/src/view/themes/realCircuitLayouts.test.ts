import { describe, expect, it } from 'vitest';
import {
  BARCELONA,
  buildTrack,
  LAS_VEGAS,
  locateOnTrack,
  MEXICO,
  MONACO,
  MONZA,
  SAO_PAULO,
  SINGAPORE,
  type TrackDefinition,
} from '@altf1/shared';
import {
  alongTrack,
  bowlPieces,
  clearance,
  fitsBeside,
  footprintBox,
  fromTrack,
  insidePolygon,
  mooredBoats,
  polygonBounds,
  scatter,
  standPieces,
} from '../scenery/placement';
import { GRANDSTAND_REACH } from '../scenery/buildings';
import { BOWL_PIECE, BOWL_REACH } from '../scenery/stadium';
import {
  BARCELONA_OVAL,
  BARCELONA_OVAL_WIDTH,
  BARCELONA_PIT_BUILDINGS,
  BARCELONA_PIT_LANE,
  BARCELONA_STANDS,
  BARCELONA_WOODS,
} from './barcelonaLayout';
import {
  MEXICO_OVAL,
  MEXICO_OVAL_WIDTH,
  MEXICO_PIT_BUILDINGS,
  MEXICO_PIT_LANE,
  MEXICO_STADIUMS,
  MEXICO_STANDS,
  MEXICO_SURROUNDINGS,
  MEXICO_WOODS,
} from './mexicoLayout';
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
import {
  LAS_VEGAS_CITY,
  LAS_VEGAS_OVAL,
  LAS_VEGAS_OVAL_WIDTH,
  LAS_VEGAS_PIT_BUILDINGS,
  LAS_VEGAS_PIT_LANE,
  LAS_VEGAS_POOLS,
  LAS_VEGAS_SEA,
  LAS_VEGAS_STANDS,
  LAS_VEGAS_WOODS,
} from './lasVegasLayout';
import { STAND_PIECE, type RealCircuitScenery } from './realCircuitTheme';
import {
  SAO_PAULO_OVAL,
  SAO_PAULO_OVAL_WIDTH,
  SAO_PAULO_PIT_BUILDINGS,
  SAO_PAULO_PIT_LANE,
  SAO_PAULO_STANDS,
  SAO_PAULO_SURROUNDINGS,
  SAO_PAULO_WOODS,
} from './saoPauloLayout';
import {
  SINGAPORE_CITY,
  SINGAPORE_OVAL,
  SINGAPORE_OVAL_WIDTH,
  SINGAPORE_PALMS,
  SINGAPORE_PIERS,
  SINGAPORE_PIT_BUILDINGS,
  SINGAPORE_PIT_LANE,
  SINGAPORE_POOLS,
  SINGAPORE_SEA,
  SINGAPORE_STANDS,
  SINGAPORE_WOODS,
} from './singaporeLayout';

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
  {
    definition: MEXICO,
    scenery: {
      stands: MEXICO_STANDS,
      pitLane: MEXICO_PIT_LANE,
      pitBuildings: MEXICO_PIT_BUILDINGS,
      woods: MEXICO_WOODS,
      oval: MEXICO_OVAL,
      ovalWidth: MEXICO_OVAL_WIDTH,
      stadiums: MEXICO_STADIUMS,
      surroundings: MEXICO_SURROUNDINGS,
    },
    // The main straight's (OSM) and the GP's temporary ones at the corners (by hand).
    minStands: 8,
    mainStand: 'Grada Curva 1',
  },
  {
    definition: SINGAPORE,
    scenery: {
      stands: SINGAPORE_STANDS,
      pitLane: SINGAPORE_PIT_LANE,
      pitBuildings: SINGAPORE_PIT_BUILDINGS,
      woods: SINGAPORE_WOODS,
      oval: SINGAPORE_OVAL,
      ovalWidth: SINGAPORE_OVAL_WIDTH,
    },
    // Placed by hand (temporary stands are not in OSM).
    minStands: 5,
    mainStand: 'Pit Grandstand',
  },
  {
    definition: LAS_VEGAS,
    scenery: {
      stands: LAS_VEGAS_STANDS,
      pitLane: LAS_VEGAS_PIT_LANE,
      pitBuildings: LAS_VEGAS_PIT_BUILDINGS,
      woods: LAS_VEGAS_WOODS,
      oval: LAS_VEGAS_OVAL,
      ovalWidth: LAS_VEGAS_OVAL_WIDTH,
    },
    // Placed by hand (temporary stands are not in OSM).
    minStands: 4,
    mainStand: 'Main Grandstand',
  },
  {
    definition: SAO_PAULO,
    scenery: {
      stands: SAO_PAULO_STANDS,
      pitLane: SAO_PAULO_PIT_LANE,
      pitBuildings: SAO_PAULO_PIT_BUILDINGS,
      woods: SAO_PAULO_WOODS,
      oval: SAO_PAULO_OVAL,
      ovalWidth: SAO_PAULO_OVAL_WIDTH,
    },
    // OSM's three on the start straight, five by hand round the lap.
    minStands: 7,
    mainStand: 'Tribuna',
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
      // Inside of the lap: the driver's right on a clockwise one, the left at Singapore.
      const side = Math.sign(locateOnTrack(track, pitLane[0]!).lateral);
      for (const p of pitLane) {
        expect(clearance(track, p)).toBeGreaterThan(scenery.pitLane.width / 2);
        expect(Math.sign(locateOnTrack(track, p).lateral)).toBe(side);
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

describe('Mexico City scenery', () => {
  const track = buildTrack(MEXICO);

  it('draws the Foro Sol around the stadium section and the ballpark, their bowls clear of the track', () => {
    const [foroSol, ballpark] = MEXICO_STADIUMS;
    // Turns 12–16 run inside the Foro Sol's outline; the ballpark is all off the track.
    const inside = track.samples.filter((s) => insidePolygon(s.position, foroSol!));
    expect(inside.length * (track.length / track.samples.length)).toBeGreaterThan(300);
    expect(track.samples.some((s) => insidePolygon(s.position, ballpark!))).toBe(false);
    for (const outline of MEXICO_STADIUMS) {
      const pieces = bowlPieces(outline, BOWL_PIECE, BOWL_REACH.back);
      const drawn = pieces.filter((box) => fitsBeside(track, box, BOWL_REACH));
      expect(drawn.length).toBeGreaterThan(pieces.length / 2);
    }
  });

  it('keeps every stand of the sports park off the circuit: none inside a stadium', () => {
    for (const stand of MEXICO_STANDS) {
      const p = fromTrack(track, stand.footprint[0]!);
      expect(MEXICO_STADIUMS.some((ring) => insidePolygon(p, ring))).toBe(false);
      // At most 60 m beyond the wall (the real reach) plus the game's wider asphalt.
      for (const spot of stand.footprint) expect(Math.abs(spot[1])).toBeLessThan(70);
    }
  });

  it('has the park around: hundreds of buildings and its domes, lakes, all clear of the track', () => {
    const { buildings, lakes } = MEXICO_SURROUNDINGS;
    expect(buildings.length).toBeGreaterThan(500);
    expect(buildings.filter((b) => b.dome).length).toBe(2);
    expect(lakes.length).toBeGreaterThan(0);
    for (const ring of [...buildings.map((b) => b.points), ...lakes]) {
      for (const p of ring) expect(clearance(track, p)).toBeGreaterThan(3.9);
    }
  });
});

describe('São Paulo scenery', () => {
  const track = buildTrack(SAO_PAULO);

  it('has the town round the park: thousands of buildings, all clear of the track', () => {
    const { buildings } = SAO_PAULO_SURROUNDINGS;
    expect(buildings.length).toBeGreaterThan(2000);
    for (const b of buildings) {
      for (const p of b.points) expect(clearance(track, p)).toBeGreaterThan(3.9);
    }
  });

  it('has the lake beside the Descida do Lago (turn 4), clear of the track', () => {
    const [lake] = SAO_PAULO_SURROUNDINGS.lakes;
    for (const p of lake!) expect(clearance(track, p)).toBeGreaterThan(3.9);
    const nearest = lake!.reduce((a, b) =>
      locateOnTrack(track, a).lateral ** 2 < locateOnTrack(track, b).lateral ** 2 ? a : b,
    );
    // Turn 4 is ~1.4 km into the real lap (4288 m).
    const at = (locateOnTrack(track, nearest).distance / track.length) * 4288;
    expect(at).toBeGreaterThan(1250);
    expect(at).toBeLessThan(1650);
  });
});

describe('Singapore town (generated from OpenStreetMap)', () => {
  const track = buildTrack(SINGAPORE);

  it('has its city up to the financial district: a thousand buildings, towers over 150 m', () => {
    expect(SINGAPORE_CITY.length).toBeGreaterThan(800);
    expect(Math.max(...SINGAPORE_CITY.map((b) => b.height))).toBeGreaterThan(150);
  });

  it('keeps every building beyond the walls, none bridging the road', () => {
    for (const b of SINGAPORE_CITY) {
      for (const p of b.points) expect(clearance(track, p)).toBeGreaterThan(0.9);
      // Every wall too, not only the corners (one cutting across a bend).
      b.points.forEach((p, i) => {
        const q = b.points[(i + 1) % b.points.length]!;
        const middle = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
        expect(clearance(track, middle)).toBeGreaterThan(-0.1);
      });
    }
    const boxes = SINGAPORE_CITY.map((b) => ({ b, box: polygonBounds(b.points) }));
    for (const { position: p } of track.samples) {
      const over = boxes.some(
        ({ b, box }) =>
          p.x >= box.minX &&
          p.x <= box.maxX &&
          p.z >= box.minZ &&
          p.z <= box.maxZ &&
          insidePolygon(p, b.points),
      );
      expect(over).toBe(false);
    }
  });

  it('never puts the bay, the river or a pool on the track, even under its bridges, nor palms', () => {
    for (const s of track.samples) {
      for (const ring of [...SINGAPORE_SEA, ...SINGAPORE_POOLS]) {
        expect(insidePolygon(s.position, ring)).toBe(false);
      }
    }
    for (const pier of SINGAPORE_PIERS)
      for (const p of pier.points) expect(clearance(track, p)).toBeGreaterThan(0.9);
    for (const p of SINGAPORE_PALMS) expect(clearance(track, p)).toBeGreaterThanOrEqual(3.9);
    expect(SINGAPORE_PALMS.length).toBeGreaterThan(100);
  });

  it('has its landmarks: the Flyer, Marina Bay Sands (three towers) and the two durians', () => {
    expect(SINGAPORE_CITY.filter((b) => b.landmark === 'flyer')).toHaveLength(1);
    expect(SINGAPORE_CITY.filter((b) => b.landmark === 'sands')).toHaveLength(3);
    expect(SINGAPORE_CITY.filter((b) => b.landmark === 'durian')).toHaveLength(2);
  });
});

describe('Las Vegas town (generated from OpenStreetMap)', () => {
  const track = buildTrack(LAS_VEGAS);

  it("has the Strip's hotels: hundreds of buildings, towers over 150 m", () => {
    expect(LAS_VEGAS_CITY.length).toBeGreaterThan(400);
    expect(
      Math.max(...LAS_VEGAS_CITY.filter((b) => !b.landmark).map((b) => b.height)),
    ).toBeGreaterThan(150);
  });

  it('keeps every building beyond the walls, none over the road, and the water off it', () => {
    for (const b of LAS_VEGAS_CITY) {
      for (const p of b.points) expect(clearance(track, p)).toBeGreaterThan(0.9);
    }
    const boxes = LAS_VEGAS_CITY.map((b) => ({ b, box: polygonBounds(b.points) }));
    for (const { position: p } of track.samples) {
      const over = boxes.some(
        ({ b, box }) =>
          p.x >= box.minX &&
          p.x <= box.maxX &&
          p.z >= box.minZ &&
          p.z <= box.maxZ &&
          insidePolygon(p, b.points),
      );
      expect(over).toBe(false);
      for (const ring of [...LAS_VEGAS_SEA, ...LAS_VEGAS_POOLS]) {
        expect(insidePolygon(p, ring)).toBe(false);
      }
    }
  });

  it('has its landmarks: the Sphere, the Eiffel Tower, the Fountains of Bellagio, the Stratosphere', () => {
    for (const kind of ['sphere', 'eiffel', 'fountains', 'strat']) {
      expect(LAS_VEGAS_CITY.filter((b) => b.landmark === kind)).toHaveLength(1);
    }
    // The fountains stand in their lake.
    const fountains = LAS_VEGAS_CITY.find((b) => b.landmark === 'fountains')!;
    const middle = {
      x: fountains.points.reduce((sum, p) => sum + p.x, 0) / fountains.points.length,
      z: fountains.points.reduce((sum, p) => sum + p.z, 0) / fountains.points.length,
    };
    expect(LAS_VEGAS_SEA.some((ring) => insidePolygon(middle, ring))).toBe(true);
    // The Stratosphere, far up the Strip, is its tallest.
    expect(LAS_VEGAS_CITY.find((b) => b.landmark === 'strat')!.height).toBe(350);
  });
});
