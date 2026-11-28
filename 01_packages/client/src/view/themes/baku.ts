import { createAsphaltTexture, createPavingTexture } from '../pixelTexture';
import { landGroundHeight } from '../scenery/ground';
import { createTrees } from '../scenery/nature';
import {
  BAKU_CITY,
  BAKU_CITY_WALLS,
  BAKU_ISLANDS,
  BAKU_OVAL,
  BAKU_OVAL_WIDTH,
  BAKU_PALMS,
  BAKU_PIERS,
  BAKU_PIT_BUILDINGS,
  BAKU_PIT_LANE,
  BAKU_POOLS,
  BAKU_SEA,
  BAKU_STANDS,
  BAKU_TUNNEL,
  BAKU_WOODS,
} from './bakuLayout';
import { BAKU_LAND } from './bakuLand';
import {
  realCircuitTheme,
  type RealCircuitLook,
  type RealCircuitScenery,
} from './realCircuitTheme';

/**
 * Baku (Baku City Circuit), a street circuit: the town from OpenStreetMap (every building with its
 * real height), the Caspian and the boulevard's piers and palms, the parks; its landmarks (the
 * Flame Towers on the hill, the Maiden Tower, Government House, the Carpet Museum) and the old
 * town's walls beside the castle section; guard rails with tall catch fences, four grandstands
 * placed by hand. Positions in the generated bakuLayout.ts. See 01_docs/themes.md.
 */
const BAKU_SCENERY: RealCircuitScenery = {
  stands: BAKU_STANDS,
  pitLane: BAKU_PIT_LANE,
  pitBuildings: BAKU_PIT_BUILDINGS,
  woods: BAKU_WOODS,
  oval: BAKU_OVAL,
  ovalWidth: BAKU_OVAL_WIDTH,
  town: {
    city: BAKU_CITY,
    sea: BAKU_SEA,
    islands: BAKU_ISLANDS,
    piers: BAKU_PIERS,
    pools: BAKU_POOLS,
    palms: BAKU_PALMS,
    tunnel: BAKU_TUNNEL,
    cityWalls: BAKU_CITY_WALLS,
  },
};

/**
 * Baku's look: a hazy Caspian sky and warm afternoon light, stone paving, broadleaf trees, guard
 * rails with catch fences. On the real land (SRTM 30 m, `bakuLand.ts`), heights above the Caspian
 * (29 m under the oceans, where its water is drawn): the boulevard by the sea, the old town's climb.
 */
const BAKU_LOOK: RealCircuitLook = {
  sky: '#a8cbe4',
  fog: { near: 500, far: 2400 },
  viewDistance: 2800,
  light: { sky: '#fff6e6', ground: '#8f8169', intensity: 2.4, sun: 1.3 },
  ground: { texture: createPavingTexture, tile: 6, margin: 900 },
  asphalt: createAsphaltTexture,
  kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
  edgeLineInset: 0,
  trees: createTrees,
  parkTrees: 0,
  barrier: 'armcoFence',
  groundHeight: landGroundHeight(BAKU_LAND, BAKU_SEA),
};

export const BAKU_THEME = realCircuitTheme(BAKU_SCENERY, BAKU_LOOK);
