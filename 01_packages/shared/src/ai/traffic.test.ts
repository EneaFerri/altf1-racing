import { describe, expect, it } from 'vitest';
import { BOT_PARAMS, type BotLevel } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { TICK_RATE } from '../config/sim';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import { createGame, findCar, findLap, stepGame, type SimContext } from '../sim/game';
import { buildTrack } from '../track/buildTrack';
import { MONACO, MONZA, TEST_TRACK } from '../track/layouts';
import type { TrackDefinition } from '../track/types';
import type { InputCommand } from '../types/input';
import { botInput, NEW_BOT_MEMORY, type BotMemory } from './driver';
import { botCarParams, buildBotPlan, type BotPlan } from './plan';

/**
 * The single-player Grand Prix's 9 bots, front to back: the 4 Medium ones ahead of the 5 Hard
 * ones, so the Hard bots have to get past (the most traffic).
 */
const GRID: readonly (readonly [string, BotLevel])[] = [
  ...[0, 1, 2, 3].map((i) => [`m${i}`, 'medium'] as const),
  ...[0, 1, 2, 3, 4].map((i) => [`h${i}`, 'hard'] as const),
];

/** Contacts between cars from this closing speed (m/s) would damage them (config/damage.ts). */
const DAMAGING = 8;

/** The 9 bots race `laps` laps of `definition` from the grid: who finished in which order, how. */
function race(definition: TrackDefinition, laps: number) {
  const track = buildTrack(definition);
  const plans: Partial<Record<BotLevel, BotPlan>> = {
    medium: buildBotPlan(track, CAR_PARAMS, BOT_PARAMS.medium),
    hard: buildBotPlan(track, CAR_PARAMS, BOT_PARAMS.hard),
  };
  const ctx: SimContext = {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
    carParamsById: Object.fromEntries(
      GRID.map(([id, level]) => [id, botCarParams(CAR_PARAMS, BOT_PARAMS[level])]),
    ),
  };
  let state = createGame(
    track,
    GRID.map(([id]) => id),
  );
  const memory = new Map<string, BotMemory>(GRID.map(([id]) => [id, NEW_BOT_MEMORY]));
  const finish: string[] = [];
  let damaging = 0;
  let resets = 0;
  const maxTicks = laps * 140 * TICK_RATE * (track.length / 2000);
  for (let tick = 0; tick < maxTicks && finish.length < GRID.length; tick++) {
    const inputs: Record<string, InputCommand> = {};
    for (const [id, level] of GRID) {
      const result = botInput(findCar(state, id)!, plans[level]!, memory.get(id)!, state.cars);
      memory.set(id, result.memory);
      if (result.input.reset) resets++;
      inputs[id] = result.input;
    }
    state = stepGame(state, inputs, ctx);
    // Each contact is reported once per car: count it once.
    damaging += state.impacts.filter(
      (i) => i.other !== 'wall' && i.carId < i.other && i.strength > DAMAGING,
    ).length;
    for (const [id] of GRID) {
      if (!finish.includes(id) && findLap(state, id)!.laps >= laps) finish.push(id);
    }
  }
  return { finish, damaging, resets };
}

const races = new Map<TrackDefinition, ReturnType<typeof race>>();
/** Each circuit's race, run once for all the tests on it. */
function raced(definition: TrackDefinition): ReturnType<typeof race> {
  if (!races.has(definition)) races.set(definition, race(definition, 3));
  return races.get(definition)!;
}

describe('bots in traffic (S.2)', () => {
  it.each([
    ['the Test Ring', TEST_TRACK],
    ['Monza', MONZA],
    ['Monaco', MONACO],
  ] as const)('9 bots race 3 laps of %s cleanly', { timeout: 60_000 }, (_name, definition) => {
    const { finish, damaging, resets } = raced(definition);
    expect(finish).toHaveLength(GRID.length); // everyone finishes
    expect(resets).toBe(0); // nobody stuck
    expect(damaging).toBeLessThanOrEqual(5); // a few racing incidents (blind to traffic: ~80,000 contacts at Monza)
  });

  it.each([
    ['the Test Ring', TEST_TRACK],
    ['Monza', MONZA],
  ] as const)('Hard bots overtake Medium ones on %s', { timeout: 60_000 }, (_name, definition) => {
    const { finish } = raced(definition);
    const lastMedium = Math.max(...finish.map((id, i) => (id.startsWith('m') ? i : -1)));
    const firstHard = finish.findIndex((id) => id.startsWith('h'));
    expect(firstHard).toBeLessThan(lastMedium);
  });
});
