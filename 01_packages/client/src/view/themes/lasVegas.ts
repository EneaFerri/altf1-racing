import { createAsphaltTexture, createPavingTexture } from '../pixelTexture';
import { createTrees } from '../scenery/nature';
import {
  LAS_VEGAS_OVAL,
  LAS_VEGAS_OVAL_WIDTH,
  LAS_VEGAS_PIT_BUILDINGS,
  LAS_VEGAS_PIT_LANE,
  LAS_VEGAS_STANDS,
  LAS_VEGAS_WOODS,
} from './lasVegasLayout';
import { realCircuitTheme } from './realCircuitTheme';

/**
 * Las Vegas (Las Vegas Strip Circuit), a night race (Singapore's night look, 01_docs/themes.md): a
 * deep navy sky with stars, the track bright under floodlights, the ground dark paving (car parks
 * and sidewalks), guard rails with catch fences (a street circuit); for now (step 2.4d.1) the real
 * pit lane and pit buildings from OpenStreetMap (positions in the generated lasVegasLayout.ts).
 * The Strip's hotels and landmarks come next (2.4d.2).
 */
export const LAS_VEGAS_THEME = realCircuitTheme(
  {
    stands: LAS_VEGAS_STANDS,
    pitLane: LAS_VEGAS_PIT_LANE,
    pitBuildings: LAS_VEGAS_PIT_BUILDINGS,
    woods: LAS_VEGAS_WOODS,
    oval: LAS_VEGAS_OVAL,
    ovalWidth: LAS_VEGAS_OVAL_WIDTH,
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
