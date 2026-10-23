import { createAsphaltTexture, createDryGrassTexture } from '../pixelTexture';
import { createPines } from '../scenery/nature';
import {
  BARCELONA_OVAL,
  BARCELONA_OVAL_WIDTH,
  BARCELONA_PIT_BUILDINGS,
  BARCELONA_PIT_LANE,
  BARCELONA_STANDS,
  BARCELONA_WOODS,
} from './barcelonaLayout';
import { realCircuitTheme } from './realCircuitTheme';

/**
 * Barcelona (Circuit de Barcelona-Catalunya, Montmeló): Mediterranean look, warm hazy sky, dry
 * grass and umbrella pines around the real grandstands, pit lane and pit buildings from
 * OpenStreetMap (positions in the generated barcelonaLayout.ts). See 01_docs/themes.md.
 */
export const BARCELONA_THEME = realCircuitTheme(
  {
    stands: BARCELONA_STANDS,
    pitLane: BARCELONA_PIT_LANE,
    pitBuildings: BARCELONA_PIT_BUILDINGS,
    woods: BARCELONA_WOODS,
    oval: BARCELONA_OVAL,
    ovalWidth: BARCELONA_OVAL_WIDTH,
  },
  {
    sky: '#a8d2f2',
    fog: { near: 450, far: 2000 },
    viewDistance: 2400,
    light: { sky: '#fff6e6', ground: '#7a6a45', intensity: 2.4, sun: 1.2 },
    ground: { texture: createDryGrassTexture, tile: 16, margin: 1500 },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createPines,
  },
);
