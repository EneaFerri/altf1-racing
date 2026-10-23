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
import { locateOnTrack } from '../track/query';
import { BARCELONA, KRUNCAR, MONACO, MONZA, TEST_TRACK, TRACKS } from '../track/layouts';
import type { Track } from '../track/types';
import { botInput, NEW_BOT_MEMORY } from './driver';
import { botCarParams, buildBotPlan } from './plan';

const track = buildTrack(TEST_TRACK);
const contextFor = (track: Track): SimContext => ({
  track,
  carParams: CAR_PARAMS,
  surfaceParams: SURFACE_PARAMS,
  collisionParams: COLLISION_PARAMS,
});

interface Run {
  readonly state: GameState;
  readonly resets: number;
  readonly wallHits: number;
  /** Ticks with a wheel on grass or gravel. */
  readonly offTicks: number;
  /** Ticks spent on a branch (e.g. Kruncar's shortcut). */
  readonly branchTicks: number;
}

/** Drives car 'bot' at `level` for `seconds` on `on`; other cars in `start` stay parked. */
function drive(
  level: BotLevel,
  seconds: number,
  start = createGame(track, ['bot']),
  on: Track = track,
): Run {
  const plan = buildBotPlan(on, CAR_PARAMS, BOT_PARAMS[level]);
  const botCtx = {
    ...contextFor(on),
    carParamsById: { bot: botCarParams(CAR_PARAMS, BOT_PARAMS[level]) },
  };
  let state = start;
  let memory = NEW_BOT_MEMORY;
  let resets = 0;
  let wallHits = 0;
  let offTicks = 0;
  let branchTicks = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick++) {
    const result = botInput(findCar(state, 'bot')!, plan, memory);
    memory = result.memory;
    if (result.input.reset) resets++;
    state = stepGame(state, { bot: result.input }, botCtx);
    wallHits += state.impacts.filter((i) => i.carId === 'bot' && i.other === 'wall').length;
    const bot = findCar(state, 'bot')!;
    if (bot.wheelSurfaces.some((s) => s === 'grass' || s === 'gravel')) offTicks++;
    if (locateOnTrack(on, bot.position).route >= 0) branchTicks++;
  }
  return { state, resets, wallHits, offTicks, branchTicks };
}

const bestLapSeconds = (run: Run): number => findLap(run.state, 'bot')!.bestLap!.ticks / TICK_RATE;

/** Every level on every track, long enough for at least two timed laps on Easy. */
const runsByTrack = TRACKS.map((definition) => {
  const on = buildTrack(definition);
  const seconds = (on.length / track.length) * 130;
  const runs = Object.fromEntries(
    BOT_LEVELS.map((level) => [level, drive(level, seconds, createGame(on, ['bot']), on)]),
  ) as Record<BotLevel, Run>;
  return { name: definition.name, runs };
});
const kruncar = runsByTrack.find((t) => t.name === KRUNCAR.name)!.runs;
const monza = runsByTrack.find((t) => t.name === MONZA.name)!.runs;
const barcelona = runsByTrack.find((t) => t.name === BARCELONA.name)!.runs;
const monaco = runsByTrack.find((t) => t.name === MONACO.name)!.runs;

/**
 * Real 2025 pole laps (OpenF1, see 01_docs/circuits.md): the Hard bot's targets. `sectorTolerance`:
 * our car is slower on straights and faster in corners than an F1, so a sector mostly flat out
 * (Barcelona's S1: the main straight) drifts further from reality.
 */
const REAL_POLES = [
  {
    name: MONZA.name,
    runs: monza,
    lap: 78.792,
    sectors: [26.262, 26.483, 26.047],
    sectorTolerance: 0.07,
  },
  {
    name: BARCELONA.name,
    runs: barcelona,
    lap: 71.546,
    sectors: [21.259, 28.58, 21.707],
    sectorTolerance: 0.1,
  },
  {
    name: MONACO.name,
    runs: monaco,
    lap: 69.954,
    sectors: [18.216, 33.254, 18.484],
    sectorTolerance: 0.07,
  },
];

describe.each(runsByTrack.map((t) => [t.name, t.runs] as const))('bot on %s', (_name, runs) => {
  it.each(BOT_LEVELS)('laps cleanly on %s: no walls, no resets', (level) => {
    const run = runs[level];
    expect(findLap(run.state, 'bot')!.laps).toBeGreaterThanOrEqual(2);
    expect(run.wallHits).toBe(0);
    expect(run.resets).toBe(0);
  });

  it('never puts a wheel off the asphalt on hard', () => {
    expect(runs.hard.offTicks).toBe(0);
  });

  it('is slower on lower levels', () => {
    expect(bestLapSeconds(runs.hard)).toBeLessThan(bestLapSeconds(runs.medium));
    expect(bestLapSeconds(runs.medium)).toBeLessThan(bestLapSeconds(runs.easy));
  });
});

describe('bot', () => {
  it.each(REAL_POLES)(
    'laps $name on hard in the real pole time (±1.5%), each sector within $sectorTolerance',
    ({ runs, lap, sectors, sectorTolerance }) => {
      const best = findLap(runs.hard.state, 'bot')!.bestLap!;
      expect(Math.abs(best.ticks / TICK_RATE / lap - 1)).toBeLessThan(0.015);
      best.sectors.forEach((ticks, i) => {
        expect(Math.abs(ticks / TICK_RATE / sectors[i]! - 1)).toBeLessThan(sectorTolerance);
      });
    },
  );

  it('takes the Kruncar shortcut on hard only', () => {
    expect(kruncar.hard.branchTicks).toBeGreaterThan(20 * TICK_RATE);
    expect(kruncar.medium.branchTicks).toBeLessThan(TICK_RATE);
    expect(kruncar.easy.branchTicks).toBeLessThan(TICK_RATE);
  });

  it('keeps its racing line inside the asphalt', () => {
    const widest = (level: BotLevel): number =>
      Math.max(...buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level]).lateral.map(Math.abs));
    for (const level of BOT_LEVELS) {
      buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level]).lateral.forEach((offset, i) => {
        expect(Math.abs(offset)).toBeLessThanOrEqual(track.samples[i]!.halfWidth);
      });
    }
    expect(widest('easy')).toBeLessThan(widest('medium'));
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
      const result = botInput(car, plan, memory);
      memory = result.memory;
      reset = result.input.reset;
    }
    expect(reset).toBe(true);
  });

  it('is deterministic', () => {
    expect(drive('hard', 20).state).toEqual(drive('hard', 20).state);
  });
});
