import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { DAMAGE_PARAMS } from '../config/damage';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import type { SimContext } from '../sim/game';
import type { Track } from '../track/types';

/**
 * The simulation every online machine runs: the server's room and each client's prediction must
 * use exactly these parameters, or every prediction would be corrected. See
 * 01_docs/multiplayer.md#prediction-22. `damage`: cars take damage (a Grand Prix in qualifying or
 * the race, `damageInPhase`); every other mode and phase runs without.
 */
export function onlineSimContext(track: Track, damage = false): SimContext {
  return {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
    ...(damage && { damage: DAMAGE_PARAMS }),
  };
}
