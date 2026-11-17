import { createAsphaltTexture, createParkGrassTexture } from '../pixelTexture';
import { landGroundHeight } from '../scenery/ground';
import { createTrees } from '../scenery/nature';
import { realCircuitTheme } from './realCircuitTheme';
import { SAO_PAULO_LAND } from './saoPauloLand';
import {
  SAO_PAULO_OVAL,
  SAO_PAULO_OVAL_WIDTH,
  SAO_PAULO_PIT_BUILDINGS,
  SAO_PAULO_PIT_LANE,
  SAO_PAULO_STANDS,
  SAO_PAULO_SURROUNDINGS,
  SAO_PAULO_WOODS,
} from './saoPauloLayout';

/**
 * São Paulo (Autódromo José Carlos Pace, Interlagos), with its real heights (Phase 3,
 * 01_docs/elevation.md): the track and the ground on the real land (SRTM 30 m, generated
 * `saoPauloLand.ts`), a day race under a warm hazy sky, green grass and broadleaf trees in OSM's
 * woods, the grandstands (OSM's on the start straight, the others by hand round the lap), pit lane
 * and pit buildings, the lake by the Descida do Lago at its own level and the town of houses and
 * blocks round the park, on the slopes (positions in the generated saoPauloLayout.ts). See
 * 01_docs/themes.md.
 */
export const SAO_PAULO_THEME = realCircuitTheme(
  {
    stands: SAO_PAULO_STANDS,
    pitLane: SAO_PAULO_PIT_LANE,
    pitBuildings: SAO_PAULO_PIT_BUILDINGS,
    woods: SAO_PAULO_WOODS,
    oval: SAO_PAULO_OVAL,
    ovalWidth: SAO_PAULO_OVAL_WIDTH,
    surroundings: SAO_PAULO_SURROUNDINGS,
  },
  {
    sky: '#a9cce6',
    fog: { near: 450, far: 2200 },
    viewDistance: 2600,
    light: { sky: '#fff8ec', ground: '#6d7a52', intensity: 2.4, sun: 1.2 },
    ground: { texture: createParkGrassTexture, tile: 16, margin: 900 },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createTrees,
    groundHeight: landGroundHeight(SAO_PAULO_LAND, []),
  },
);
