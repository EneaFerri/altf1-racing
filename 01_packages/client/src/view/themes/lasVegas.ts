import { createAsphaltTexture, createPavingTexture } from '../pixelTexture';
import { createTrees } from '../scenery/nature';
import {
  LAS_VEGAS_CITY,
  LAS_VEGAS_ISLANDS,
  LAS_VEGAS_OVAL,
  LAS_VEGAS_OVAL_WIDTH,
  LAS_VEGAS_PALMS,
  LAS_VEGAS_PIERS,
  LAS_VEGAS_PIT_BUILDINGS,
  LAS_VEGAS_PIT_LANE,
  LAS_VEGAS_POOLS,
  LAS_VEGAS_SEA,
  LAS_VEGAS_STANDS,
  LAS_VEGAS_TUNNEL,
  LAS_VEGAS_WOODS,
} from './lasVegasLayout';
import { realCircuitTheme } from './realCircuitTheme';

/**
 * Las Vegas (Las Vegas Strip Circuit), a night race (Singapore's night look, 01_docs/themes.md): a
 * deep navy sky with stars, the track bright under floodlights, the ground dark paving (car parks
 * and sidewalks), guard rails with catch fences (a street circuit); the Strip's hotels and casinos
 * from OpenStreetMap with their real heights and lit windows, the Sphere, Paris's Eiffel Tower, the
 * Fountains of Bellagio and the Stratosphere far to the north (2.4d.2); the real pit lane and pit
 * buildings (positions in the generated lasVegasLayout.ts).
 */
export const LAS_VEGAS_THEME = realCircuitTheme(
  {
    stands: LAS_VEGAS_STANDS,
    pitLane: LAS_VEGAS_PIT_LANE,
    pitBuildings: LAS_VEGAS_PIT_BUILDINGS,
    woods: LAS_VEGAS_WOODS,
    oval: LAS_VEGAS_OVAL,
    ovalWidth: LAS_VEGAS_OVAL_WIDTH,
    town: {
      city: LAS_VEGAS_CITY,
      sea: LAS_VEGAS_SEA,
      islands: LAS_VEGAS_ISLANDS,
      piers: LAS_VEGAS_PIERS,
      pools: LAS_VEGAS_POOLS,
      palms: LAS_VEGAS_PALMS,
      tunnel: LAS_VEGAS_TUNNEL,
    },
  },
  {
    sky: '#0b1430',
    fog: { near: 250, far: 1500 },
    viewDistance: 2800,
    // Floodlights: a bright, slightly cool white from above, little from the dark ground.
    light: { sky: '#eef1ff', ground: '#2a2f45', intensity: 2.1, sun: 0.7 },
    ground: { texture: createPavingTexture, tile: 6, margin: 1200, tint: '#4a4f5c' },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createTrees,
    parkTrees: 0,
    barrier: 'armcoFence',
    night: { floodlightSpacing: 30 },
  },
);
