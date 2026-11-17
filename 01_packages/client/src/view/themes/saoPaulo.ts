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
  SAO_PAULO_WOODS,
} from './saoPauloLayout';

/**
 * São Paulo (Autódromo José Carlos Pace, Interlagos), with its real heights (Phase 3,
 * 01_docs/elevation.md): the track and the ground on the real land (SRTM 30 m, generated
 * `saoPauloLand.ts`), a day race under a warm hazy sky, green grass and broadleaf trees in OSM's
 * woods, the real grandstands, pit lane and pit buildings (positions in the generated
 * saoPauloLayout.ts). The lakes and the town around come next (2.4e.3). See 01_docs/themes.md.
 */
export const SAO_PAULO_THEME = realCircuitTheme(
  {
    stands: SAO_PAULO_STANDS,
    pitLane: SAO_PAULO_PIT_LANE,
    pitBuildings: SAO_PAULO_PIT_BUILDINGS,
    woods: SAO_PAULO_WOODS,
    oval: SAO_PAULO_OVAL,
    ovalWidth: SAO_PAULO_OVAL_WIDTH,
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
