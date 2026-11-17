import { createAsphaltTexture, createParkGrassTexture } from '../pixelTexture';
import { createTrees } from '../scenery/nature';
import {
  SINGAPORE_OVAL,
  SINGAPORE_OVAL_WIDTH,
  SINGAPORE_PIT_BUILDINGS,
  SINGAPORE_PIT_LANE,
  SINGAPORE_STANDS,
  SINGAPORE_WOODS,
} from './singaporeLayout';
import { realCircuitTheme } from './realCircuitTheme';

/**
 * Singapore (Marina Bay Street Circuit), a night race: a deep navy sky with stars, the track bright
 * under floodlights on poles behind the walls (2.4c.2), the distance fading into the dark; guard
 * rails with catch fences (a street circuit); the real pit lane, pit buildings and parks from
 * OpenStreetMap (positions in the generated singaporeLayout.ts). The town around the bay comes
 * next (2.4c.3). See 01_docs/themes.md.
 */
export const SINGAPORE_THEME = realCircuitTheme(
  {
    stands: SINGAPORE_STANDS,
    pitLane: SINGAPORE_PIT_LANE,
    pitBuildings: SINGAPORE_PIT_BUILDINGS,
    woods: SINGAPORE_WOODS,
    oval: SINGAPORE_OVAL,
    ovalWidth: SINGAPORE_OVAL_WIDTH,
  },
  {
    sky: '#0b1430',
    fog: { near: 250, far: 1500 },
    viewDistance: 2800,
    // Floodlights: a bright, slightly cool white from above, little from the dark ground.
    light: { sky: '#eef1ff', ground: '#2a2f45', intensity: 2.1, sun: 0.7 },
    ground: { texture: createParkGrassTexture, tile: 16, margin: 1200, tint: '#4f5a66' },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createTrees,
    barrier: 'armcoFence',
    night: { floodlightSpacing: 30 },
  },
);
