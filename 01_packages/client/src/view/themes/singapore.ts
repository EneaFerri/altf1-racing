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
 * Singapore (Marina Bay Street Circuit): for now (step 2.4c.1) the real pit lane, pit buildings
 * and parks from OpenStreetMap (positions in the generated singaporeLayout.ts) in a plain daylight
 * look, guard rails with catch fences as a street circuit. The night look (2.4c.2) and the town
 * around the bay (2.4c.3) come next. See 01_docs/themes.md.
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
    sky: '#9fcbe8',
    fog: { near: 500, far: 2400 },
    viewDistance: 2800,
    light: { sky: '#fffaf0', ground: '#6f7a5a', intensity: 2.4, sun: 1.2 },
    ground: { texture: createParkGrassTexture, tile: 16, margin: 1200 },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createTrees,
    barrier: 'armcoFence',
  },
);
