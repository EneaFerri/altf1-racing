import { createAsphaltTexture, createPavingTexture } from '../pixelTexture';
import { createPines } from '../scenery/nature';
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
import { realCircuitTheme } from './realCircuitTheme';

/**
 * Monaco, a street circuit: the town from OpenStreetMap (every building with its real height, in
 * Riviera pastels), the sea and Port Hercule with its pontoons, the Rainier III pool, the palms,
 * the tunnel under the Fairmont; guard rails with tall catch fences, three grandstands placed by
 * hand (B, K, T). Positions in the generated monacoLayout.ts. See 01_docs/themes.md.
 */
export const MONACO_THEME = realCircuitTheme(
  {
    stands: MONACO_STANDS,
    pitLane: MONACO_PIT_LANE,
    pitBuildings: MONACO_PIT_BUILDINGS,
    woods: MONACO_WOODS,
    oval: MONACO_OVAL,
    ovalWidth: MONACO_OVAL_WIDTH,
    town: {
      city: MONACO_CITY,
      sea: MONACO_SEA,
      islands: MONACO_ISLANDS,
      piers: MONACO_PIERS,
      pools: MONACO_POOLS,
      palms: MONACO_PALMS,
      tunnel: MONACO_TUNNEL,
    },
  },
  {
    sky: '#9fd3f7',
    fog: { near: 500, far: 2400 },
    viewDistance: 2800,
    light: { sky: '#fffaf0', ground: '#8a7f6a', intensity: 2.4, sun: 1.3 },
    ground: { texture: createPavingTexture, tile: 6, margin: 900 },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createPines,
    parkTrees: 0,
    barrier: 'armcoFence',
  },
);
