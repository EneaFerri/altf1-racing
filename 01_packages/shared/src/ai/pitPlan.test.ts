import { describe, expect, it } from 'vitest';
import { BOT_PARAMS } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { PIT_PARAMS } from '../config/pit';
import { TICK_RATE } from '../config/sim';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import { createGame, findCar, findLap, stepGame, type SimContext } from '../sim/game';
import { pitLanePlace } from '../sim/pit';
import { buildTrack } from '../track/buildTrack';
import { GP_TRACKS, MONZA, SAO_PAULO, SINGAPORE } from '../track/layouts';
import { locateOnTrack } from '../track/query';
import type { TrackDefinition } from '../track/types';
import type { InputCommand } from '../types/input';
import { botInput, NEW_BOT_MEMORY, type BotMemory } from './driver';
import { buildBotPlan, buildPitPlan, type BotPlan } from './plan';
import { canSwitchPlan, pitDue, pitSchedule } from './pitPlan';

describe('pit schedule', () => {
  it('spreads the mandatory stops evenly over the race', () => {
    expect(pitSchedule(3)).toEqual([]);
    expect(pitSchedule(4)).toEqual([2]);
    expect(pitSchedule(5)).toEqual([2]);
    expect(pitSchedule(8)).toEqual([2, 5]);
    expect(pitSchedule(12)).toEqual([3, 6, 9]);
    expect(pitSchedule(24)).toEqual([4, 9, 14, 19]);
  });

  it('owes a stop once its lap is done, until it is made', () => {
    const schedule = [2, 5];
    expect(pitDue(schedule, 1, 0)).toBe(false);
    expect(pitDue(schedule, 2, 0)).toBe(true);
    expect(pitDue(schedule, 3, 1)).toBe(false);
    expect(pitDue(schedule, 5, 1)).toBe(true);
    expect(pitDue(schedule, 7, 2)).toBe(false);
  });
});

/** One bot of a race with stops: its plans, which one it drives and the laps it stopped on. */
interface Racer {
  readonly id: string;
  readonly plans: { readonly race: BotPlan; readonly pit: BotPlan };
  using: 'race' | 'pit';
  memory: BotMemory;
  readonly stops: number[];
  lastStop: number | null;
}

/**
 * Hard bots race `laps` laps of `definition`, one per entry of `boxes` (its pit box), in traffic,
 * each making its stops: what happened.
 */
function raceWithStops(definition: TrackDefinition, laps: number, boxes: readonly number[]) {
  const track = buildTrack(definition, { pitLane: true });
  const race = buildBotPlan(track, CAR_PARAMS, BOT_PARAMS.hard);
  const racers: Racer[] = boxes.map((box, i) => ({
    id: `b${i}`,
    plans: { race, pit: buildPitPlan(track, CAR_PARAMS, BOT_PARAMS.hard, box, PIT_PARAMS) },
    using: 'race',
    memory: NEW_BOT_MEMORY,
    stops: [],
    lastStop: null,
  }));
  const ctx: SimContext = {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
    pit: { params: PIT_PARAMS, boxes: Object.fromEntries(racers.map((r, i) => [r.id, boxes[i]!])) },
  };
  const schedule = pitSchedule(laps);
  let state = createGame(
    track,
    racers.map((r) => r.id),
  );
  /** The hardest wall contact in the pit lane (m/s): getting round a car in its box may graze it. */
  let wallHit = 0;
  let resets = 0;
  const done = () => racers.every((r) => findLap(state, r.id)!.laps >= laps);
  const maxTicks = laps * 200 * TICK_RATE * (track.length / 5000);
  for (let tick = 0; tick < maxTicks && !done(); tick++) {
    const inputs: Record<string, InputCommand> = {};
    for (const racer of racers) {
      const car = findCar(state, racer.id)!;
      const lapsDone = findLap(state, racer.id)!.laps;
      const want = pitDue(schedule, lapsDone, racer.stops.length) ? 'pit' : 'race';
      if (
        want !== racer.using &&
        canSwitchPlan(track, locateOnTrack(track, car.position).distance)
      ) {
        racer.using = want;
      }
      const result = botInput(car, racer.plans[racer.using], racer.memory, state.cars);
      racer.memory = result.memory;
      if (result.input.reset) resets++;
      inputs[racer.id] = result.input;
    }
    state = stepGame(state, inputs, ctx);
    for (const impact of state.impacts) {
      const inLane = pitLanePlace(track, findCar(state, impact.carId)!.position) !== null;
      if (impact.other === 'wall' && inLane) wallHit = Math.max(wallHit, impact.strength);
    }
    for (const racer of racers) {
      const stop = findCar(state, racer.id)!.pitStop;
      if (stop && stop.until !== racer.lastStop) {
        racer.lastStop = stop.until;
        racer.stops.push(findLap(state, racer.id)!.laps);
      }
    }
  }
  return {
    laps: racers.map((r) => findLap(state, r.id)!.laps),
    stops: racers.map((r) => r.stops),
    wallHit,
    resets,
  };
}

describe('bots that pit (S.3)', () => {
  it.each(GP_TRACKS.map((d) => [d.name, d] as const))(
    'a Hard bot makes its stop over 5 laps of %s and finishes',
    { timeout: 60_000 },
    (_name, definition) => {
      const result = raceWithStops(definition, 5, [0]);
      expect(result).toEqual({ laps: [5], stops: [[2]], wallHit: 0, resets: 0 });
    },
  );

  it.each([MONZA, SINGAPORE, SAO_PAULO].map((d) => [d.name, d] as const))(
    'three bots in a row, boxes 7, 0 and 3, all make their stops at %s',
    { timeout: 60_000 },
    (_name, definition) => {
      const result = raceWithStops(definition, 5, [7, 0, 3]);
      expect(result.laps).toEqual([5, 5, 5]);
      // One stop each, on its in-lap (lap 3 when its box is past the line).
      for (const stops of result.stops) expect(stops).toHaveLength(1);
      expect(result.resets).toBe(0);
      expect(result.wallHit).toBeLessThan(2); // grazes at most
    },
  );
});
