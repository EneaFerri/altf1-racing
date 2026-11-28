import { BOT_PARAMS, type BotLevel } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { TICK_RATE } from '../config/sim';
import { SLOPE_PARAMS } from '../config/slope';
import { weatherCompound } from '../config/tyres';
import { createGame, findCar, findLap, stepGame, type SimContext } from '../sim/game';
import { startingTyres, trackWetness } from '../sim/weather';
import { botInput, NEW_BOT_MEMORY } from './driver';
import { botCarParams, buildBotPlan } from './plan';
import { planWet, wetLift } from './squad';

/**
 * A bot's flying lap at `level` (ticks), driven for real on `ctx`'s track and weather (as wet as
 * at tick 0, on the tyres it asks for: `startingTyres`): alone, from the grid, the best of its
 * first two laps (single player's Grand Prix gives this as the bots' qualifying, S.5). Null if it
 * never completes a valid lap. Pure.
 */
export function botLapTicks(ctx: SimContext, level: BotLevel): number | null {
  const { track, weather, tyres } = ctx;
  const fitted = startingTyres(weather, tyres, 0);
  const wetness = trackWetness(weather, 0);
  const compound = fitted?.compound ?? weatherCompound(0);
  const { wet } = planWet(compound, wetness, weather, tyres);
  const plan = buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level], SLOPE_PARAMS, wet);
  // Without damage: a qualifying lap on its own.
  const clean: SimContext = {
    ...withoutDamage(ctx),
    carParamsById: { bot: botCarParams(CAR_PARAMS, BOT_PARAMS[level]) },
  };
  let state = createGame(track, ['bot'], fitted);
  let memory = NEW_BOT_MEMORY;
  const limit = (track.length / 20) * 2 * TICK_RATE; // two laps at 20 m/s at worst
  for (let tick = 0; tick < limit && findLap(state, 'bot')!.laps < 2; tick++) {
    const car = findCar(state, 'bot')!;
    const result = botInput(car, plan, memory);
    memory = result.memory;
    const input = wetLift(car, result.input, trackWetness(weather, state.tick), tyres);
    state = stepGame(state, { bot: input }, clean);
  }
  return findLap(state, 'bot')!.bestLap?.ticks ?? null;
}

function withoutDamage({ damage: _damage, ...ctx }: SimContext): SimContext {
  return ctx;
}
