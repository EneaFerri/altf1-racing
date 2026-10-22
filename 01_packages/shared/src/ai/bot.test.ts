import { describe, expect, it } from 'vitest';
import { BOT_LEVELS, BOT_PARAMS, type BotLevel } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { TICK_RATE } from '../config/sim';
import { SURFACE_PARAMS } from '../config/surfaces';
import {
  createGame,
  findCar,
  findLap,
  placeCar,
  stepGame,
  type GameState,
  type SimContext,
} from '../sim/game';
import { buildTrack } from '../track/buildTrack';
import { TEST_TRACK } from '../track/layouts/testTrack';
import { botInput, NEW_BOT_MEMORY } from './driver';
import { botCarParams, buildBotPlan } from './plan';

const track = buildTrack(TEST_TRACK);
const ctx: SimContext = {
  track,
  carParams: CAR_PARAMS,
  surfaceParams: SURFACE_PARAMS,
  collisionParams: COLLISION_PARAMS,
};

interface Run {
  readonly state: GameState;
  readonly resets: number;
  readonly wallHits: number;
  readonly driftTicks: number;
  /** Ticks with a wheel on grass or gravel. */
  readonly offTicks: number;
}

/** Drives car 'bot' at `level` for `seconds`; other cars in `start` stay parked. */
function drive(level: BotLevel, seconds: number, start = createGame(track, ['bot'])): Run {
  const plan = buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level]);
  const botCtx = { ...ctx, carParamsById: { bot: botCarParams(CAR_PARAMS, BOT_PARAMS[level]) } };
  let state = start;
  let memory = NEW_BOT_MEMORY;
  let resets = 0;
  let wallHits = 0;
  let driftTicks = 0;
  let offTicks = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick++) {
    const result = botInput(findCar(state, 'bot')!, plan, track, memory);
    memory = result.memory;
    if (result.input.reset) resets++;
    state = stepGame(state, { bot: result.input }, botCtx);
    wallHits += state.impacts.filter((i) => i.carId === 'bot' && i.other === 'wall').length;
    const bot = findCar(state, 'bot')!;
    if (bot.drifting) driftTicks++;
    if (bot.wheelSurfaces.some((s) => s === 'grass' || s === 'gravel')) offTicks++;
  }
  return { state, resets, wallHits, driftTicks, offTicks };
}

const bestLapSeconds = (run: Run): number => findLap(run.state, 'bot')!.bestLap!.ticks / TICK_RATE;

describe('bot', () => {
  const runs = Object.fromEntries(BOT_LEVELS.map((level) => [level, drive(level, 130)])) as Record<
    BotLevel,
    Run
  >;

  it.each(BOT_LEVELS)('laps the Test Ring cleanly on %s: no walls, no resets', (level) => {
    const run = runs[level];
    expect(findLap(run.state, 'bot')!.laps).toBeGreaterThanOrEqual(3);
    expect(run.wallHits).toBe(0);
    expect(run.resets).toBe(0);
  });

  it('is slower on lower levels, by about the planned margins', () => {
    const hard = bestLapSeconds(runs.hard);
    const medium = bestLapSeconds(runs.medium);
    const easy = bestLapSeconds(runs.easy);
    // Hard drifts and has a slightly stronger car: faster than the owner's best lap (29 s).
    expect(hard).toBeLessThan(28.5);
    expect(medium).toBeGreaterThan(33);
    expect(medium).toBeLessThan(35);
    expect(easy / medium).toBeGreaterThan(1.14);
    expect(easy / medium).toBeLessThan(1.25);
  });

  it('drifts only on hard', () => {
    expect(runs.hard.driftTicks).toBeGreaterThan(0);
    expect(runs.medium.driftTicks).toBe(0);
    expect(runs.easy.driftTicks).toBe(0);
  });

  it('never puts a wheel off the asphalt on hard', () => {
    expect(runs.hard.offTicks).toBe(0);
  });

  it('keeps its racing line inside the asphalt', () => {
    const widest = (level: BotLevel): number =>
      Math.max(...buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level]).lateral.map(Math.abs));
    for (const level of BOT_LEVELS) {
      buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level]).lateral.forEach((offset, i) => {
        expect(Math.abs(offset)).toBeLessThanOrEqual(track.samples[i]!.halfWidth);
      });
    }
    // Hard drifts, and a drifting car needs more room: its line stays narrower than Medium's.
    expect(widest('easy')).toBeLessThan(widest('medium'));
    expect(widest('hard')).toBeLessThan(widest('medium'));
  });

  it('gets going again after being stopped by a car parked on its line', () => {
    // A parked car 60 m ahead on the centreline, right where the bot accelerates off the grid.
    const start = placeCar(createGame(track, ['bot', 'player']), track, 'player', 'bot', 60);
    const run = drive('medium', 90, start);
    expect(findLap(run.state, 'bot')!.laps).toBeGreaterThanOrEqual(1);
  });

  it('resets like a player (R) after being stuck for a while', () => {
    const car = findCar(createGame(track, ['bot']), 'bot')!;
    const plan = buildBotPlan(track, CAR_PARAMS, BOT_PARAMS.medium);
    let memory = NEW_BOT_MEMORY;
    let reset = false;
    for (let tick = 0; tick < 3 * TICK_RATE && !reset; tick++) {
      const result = botInput(car, plan, track, memory);
      memory = result.memory;
      reset = result.input.reset;
    }
    expect(reset).toBe(true);
  });

  it('is deterministic', () => {
    expect(drive('hard', 20).state).toEqual(drive('hard', 20).state);
  });
});
