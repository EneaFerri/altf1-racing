import { createAsphaltTexture, createParkGrassTexture } from '../pixelTexture';
import { createTrees } from '../scenery/nature';
import {
  MONZA_OVAL,
  MONZA_OVAL_WIDTH,
  MONZA_PIT_BUILDINGS,
  MONZA_PIT_LANE,
  MONZA_STANDS,
  MONZA_WOODS,
} from './monzaLayout';
import { realCircuitTheme } from './realCircuitTheme';

/**
 * Monza, in the Parco di Monza: green park with broadleaf trees around the real grandstands, pit
 * lane and pit buildings, woods and the old high-speed oval from OpenStreetMap (positions in the
 * generated monzaLayout.ts). See 01_docs/themes.md.
 */
export const MONZA_THEME = realCircuitTheme(
  {
    stands: MONZA_STANDS,
    pitLane: MONZA_PIT_LANE,
    pitBuildings: MONZA_PIT_BUILDINGS,
    woods: MONZA_WOODS,
    oval: MONZA_OVAL,
    ovalWidth: MONZA_OVAL_WIDTH,
  },
  {
    sky: '#8ec5f0',
    fog: { near: 450, far: 2200 },
    viewDistance: 2600,
    light: { sky: '#ffffff', ground: '#4a5a3a', intensity: 2.2, sun: 1 },
    ground: { texture: createParkGrassTexture, tile: 16, margin: 1500 },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createTrees,
  },
);
