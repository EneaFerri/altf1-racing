import { BOT_PARAMS, type BotLevel } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { TICK_RATE } from '../config/sim';
import { SLOPE_PARAMS } from '../config/slope';
import { createGame, findCar, findLap, stepGame, type SimContext } from '../sim/game';
import { botInput, NEW_BOT_MEMORY } from './driver';
import { botCarParams, buildBotPlan } from './plan';

/**
 * A bot's flying lap at `level` (ticks), driven for real on `ctx`'s track and weather: alone, from
 * the grid, the best of its first two laps (single player's Grand Prix gives this as the bots'
 * qualifying, S.5). Null if it never completes a valid lap. Pure.
 */
export function botLapTicks(ctx: SimContext, level: BotLevel): number | null {
  const { track } = ctx;
  const plan = buildBotPlan(
    track,
    CAR_PARAMS,
    BOT_PARAMS[level],
    SLOPE_PARAMS,
    ctx.weather?.params,
  );
  // Without damage: a qualifying lap on its own.
  const clean: SimContext = {
    ...withoutDamage(ctx),
    carParamsById: { bot: botCarParams(CAR_PARAMS, BOT_PARAMS[level]) },
  };
  let state = createGame(track, ['bot']);
  let memory = NEW_BOT_MEMORY;
  const limit = (track.length / 20) * 2 * TICK_RATE; // two laps at 20 m/s at worst
  for (let tick = 0; tick < limit && findLap(state, 'bot')!.laps < 2; tick++) {
    const result = botInput(findCar(state, 'bot')!, plan, memory);
    memory = result.memory;
    state = stepGame(state, { bot: result.input }, clean);
  }
  return findLap(state, 'bot')!.bestLap?.ticks ?? null;
}

function withoutDamage({ damage: _damage, ...ctx }: SimContext): SimContext {
  return ctx;
}
