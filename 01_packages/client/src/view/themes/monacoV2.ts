import { landGroundHeight } from '../scenery/ground';
import { MONACO_LOOK, MONACO_SCENERY } from './monaco';
import { MONACO_SEA } from './monacoLayout';
import { MONACO_V2_LAND } from './monacoV2Land';
import { realCircuitTheme } from './realCircuitTheme';

/**
 * Monaco v2, Monaco with its real heights (Phase 3, 01_docs/elevation.md; single player and
 * online): Monaco itself (the same town, harbour, tunnel and look: the track's shape is the same) on
 * the real land
 * (EU-DEM 25 m, `monacoV2Land.ts`): the town climbing from Port Hercule to the Casino and the
 * slopes above it, every building, stand, palm and pine on the ground, the sea at 0 against its
 * quays.
 */
export const MONACO_V2_THEME = realCircuitTheme(MONACO_SCENERY, {
  ...MONACO_LOOK,
  // Paving in the town, green-grey above it: the slopes of the Moyenne Corniche (as the hills).
  ground: { ...MONACO_LOOK.ground, highland: { from: 55, to: 95, color: '#86956f' } },
  groundHeight: landGroundHeight(MONACO_V2_LAND, MONACO_SEA),
});
