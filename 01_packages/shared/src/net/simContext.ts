import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { DAMAGE_PARAMS } from '../config/damage';
import { PIT_PARAMS } from '../config/pit';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import { TYRE_PARAMS } from '../config/tyres';
import { everWet, WET_PARAMS, type Forecast } from '../config/weather';
import type { CarId } from '../sim/car';
import type { SimContext } from '../sim/game';
import { placePuddles } from '../sim/weather';
import type { Track } from '../track/types';

/**
 * The simulation every online machine runs: the server's room and each client's prediction must
 * use exactly these parameters, or every prediction would be corrected. See
 * 01_docs/multiplayer.md#prediction-22. A Grand Prix's rules: `damage` (in qualifying and the race,
 * `damageInPhase`), and on its track with the pit lane the pit rules, with each driver's box
 * (`pitBoxes`, from the GP), and the weather its manager chose (`forecast`: a wet track, with its
 * puddles, as wet as it says when). Every other mode runs without: dry, no damage.
 */
export function onlineSimContext(
  track: Track,
  rules: {
    readonly damage?: boolean;
    readonly pitBoxes?: Readonly<Record<CarId, number>>;
    readonly forecast?: Forecast;
  } = {},
): SimContext {
  return {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
    ...(rules.damage && { damage: DAMAGE_PARAMS }),
    ...(track.routes.some((road) => road.pit) && {
      pit: { params: PIT_PARAMS, boxes: rules.pitBoxes ?? {} },
      tyres: TYRE_PARAMS,
    }),
    ...(rules.forecast &&
      everWet(rules.forecast) && {
        weather: { params: WET_PARAMS, puddles: placePuddles(track), forecast: rules.forecast },
      }),
  };
}
