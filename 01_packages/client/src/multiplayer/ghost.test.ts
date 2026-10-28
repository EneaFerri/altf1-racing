import { describe, expect, it } from 'vitest';
import {
  BOT_PARAMS,
  botInput,
  buildBotPlan,
  buildTrack,
  CAR_PARAMS,
  createCar,
  createGame,
  createLapState,
  distance,
  findCar,
  findLap,
  NEW_BOT_MEMORY,
  onlineSimContext,
  stepGame,
  TEST_TRACK,
  vec2,
  type GameState,
  type LapState,
} from '@altf1/shared';
import { Ghost } from './ghost';

/** p1 at x = `x` on tick `tick`, with its timing as `lap` says. */
function state(tick: number, x: number, lap: Partial<LapState>): GameState {
  return {
    tick,
    cars: [createCar({ id: 'p1', position: vec2(x, 0) })],
    impacts: [],
    laps: [{ ...createLapState('p1', 0), ...lap }],
  };
}

/** Timing after `laps` completed laps, the last one `ticks` long, the current one from `start`. */
function timing(laps: number, start: number, ticks = 0, valid = true): Partial<LapState> {
  return { laps, lapStartTick: start, lastLap: laps > 0 ? { ticks, sectors: [], valid } : null };
}

/** Records ticks `from`..`to` - 1, the car at x = `offset` + tick. */
function drive(ghost: Ghost, from: number, to: number, lap: Partial<LapState>, offset = 0): void {
  for (let tick = from; tick < to; tick++) ghost.record(state(tick, offset + tick, lap));
}

const ghostX = (ghost: Ghost, tick: number): number | undefined =>
  ghost.frameAt(tick)?.before.position.x;

describe('Ghost', () => {
  it('appears once a first valid lap is done, replayed in step with the new lap', () => {
    const ghost = new Ghost('p1');
    drive(ghost, 0, 10, { lapStartTick: null }); // out-lap
    expect(ghost.frameAt(5)).toBeNull();
    drive(ghost, 10, 110, timing(0, 10)); // first timed lap: 100 ticks
    expect(ghost.frameAt(50)).toBeNull();
    drive(ghost, 110, 120, timing(1, 110, 100));
    // 5.5 ticks into the new lap: between the first lap's ticks 15 and 16.
    expect(ghost.frameAt(115.5)).toMatchObject({
      before: { position: { x: 15 } },
      after: { position: { x: 16 } },
      alpha: 0.5,
    });
    expect(ghost.frameAt(110 + 100)).toBeNull(); // the ghost has crossed the line
  });

  it('keeps the fastest valid lap: slower and invalid laps never replace it', () => {
    const ghost = new Ghost('p1');
    drive(ghost, 10, 110, timing(0, 10)); // 100 ticks
    drive(ghost, 110, 230, timing(1, 110, 100), 1000); // 120 ticks: slower
    drive(ghost, 230, 310, timing(2, 230, 120), 2000); // 80 ticks, but voided by a reset
    drive(ghost, 310, 400, timing(3, 310, 80, false), 3000); // 90 ticks: the new best
    drive(ghost, 400, 401, timing(4, 400, 90));
    expect(ghostX(ghost, 400)).toBe(3310);
  });

  it('records a tick the prediction redid again, and fills one it skipped', () => {
    const ghost = new Ghost('p1');
    const lap = timing(0, 0);
    drive(ghost, 0, 6, lap);
    ghost.record(state(3, 99, lap)); // a snapshot redid ticks 3…
    ghost.record(state(5, 55, lap)); // …and the replay jumped one tick ahead
    ghost.record(state(6, 66, lap));
    drive(ghost, 7, 10, lap);
    drive(ghost, 10, 11, timing(1, 10, 10));
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((t) => ghostX(ghost, 10 + t))).toEqual([
      0, 1, 2, 99, 99, 55, 66, 7,
    ]);
  });

  it('replays a real lap: the ghost leaves the line with the car and crosses it in its time', () => {
    const track = buildTrack(TEST_TRACK);
    const ctx = onlineSimContext(track);
    const plan = buildBotPlan(track, CAR_PARAMS, BOT_PARAMS.hard);
    const ghost = new Ghost('p1');
    let state = createGame(track, ['p1']);
    let memory = NEW_BOT_MEMORY;
    while (findLap(state, 'p1')!.laps < 2) {
      const result = botInput(findCar(state, 'p1')!, plan, memory);
      memory = result.memory;
      state = stepGame(state, { p1: result.input }, ctx);
      ghost.record(state);
    }
    const lap = findLap(state, 'p1')!;
    const best = lap.bestLap!.ticks;
    const start = lap.lapStartTick!;
    // On the start line together with the car that just began its third lap…
    expect(
      distance(ghost.frameAt(start)!.before.position, findCar(state, 'p1')!.position),
    ).toBeLessThan(2);
    // …and gone once its lap time has run out.
    expect(ghost.frameAt(start + best - 1)).not.toBeNull();
    expect(ghost.frameAt(start + best)).toBeNull();
  });
});
