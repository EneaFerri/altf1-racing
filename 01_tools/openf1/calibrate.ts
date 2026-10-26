/**
 * Finds the scale at which the Hard bot laps a circuit in the real pole time: drives it headless
 * with the game's own simulation and bot, then corrects the scale by the time ratio until it is
 * within TOLERANCE. Prints the scale to put in circuits.ts, and every level's times vs reality.
 * Usage: node --import ./01_tools/resolveTs.ts 01_tools/openf1/calibrate.ts <id> [scale]
 * (with a scale: only measures it).
 */
import {
  BOT_LEVELS,
  BOT_PARAMS,
  botCarParams,
  botInput,
  buildBotPlan,
  buildTrack,
  CAR_PARAMS,
  COLLISION_PARAMS,
  createGame,
  findCar,
  findLap,
  NEW_BOT_MEMORY,
  SLIPSTREAM_PARAMS,
  stepGame,
  SURFACE_PARAMS,
  TICK_RATE,
  type BotLevel,
  type TrackDefinition,
} from '../../01_packages/shared/src/index.ts';
import { circuitById } from './circuits.ts';
import { generate } from './generate.ts';
import { profilePath, readJson, type CircuitProfile } from './openf1.ts';

/** Accepted gap between the Hard bot's lap and the pole (fraction). */
const TOLERANCE = 0.002;

interface Measure {
  readonly lap: number;
  readonly sectors: readonly number[];
  readonly wallHits: number;
  readonly offTicks: number;
  readonly resets: number;
  /** Where the wall hits and the off-track moments began (m from the line, game scale). */
  readonly incidents: readonly number[];
}

/** Drives the bot alone from the grid until it has two timed laps; its best one. */
function measure(definition: TrackDefinition, level: BotLevel, poleTime: number): Measure {
  const track = buildTrack(definition);
  const plan = buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level]);
  const ctx = {
    track,
    carParams: CAR_PARAMS,
    surfaceParams: SURFACE_PARAMS,
    collisionParams: COLLISION_PARAMS,
    slipstreamParams: SLIPSTREAM_PARAMS,
    carParamsById: { bot: botCarParams(CAR_PARAMS, BOT_PARAMS[level]) },
  };
  let state = createGame(track, ['bot']);
  let memory = NEW_BOT_MEMORY;
  let wallHits = 0;
  let offTicks = 0;
  let resets = 0;
  let wasOff = false;
  const incidents: number[] = [];
  const at = (): number => Math.round(findLap(state, 'bot')!.distance);
  const limit = poleTime * 5 * TICK_RATE;
  for (let t = 0; t < limit && findLap(state, 'bot')!.laps < 2; t++) {
    const result = botInput(findCar(state, 'bot')!, plan, memory);
    memory = result.memory;
    if (result.input.reset) resets++;
    state = stepGame(state, { bot: result.input }, ctx);
    const hits = state.impacts.filter((i) => i.carId === 'bot' && i.other === 'wall').length;
    if (hits > 0) incidents.push(at());
    wallHits += hits;
    const off = findCar(state, 'bot')!.wheelSurfaces.some((s) => s === 'grass' || s === 'gravel');
    if (off) offTicks++;
    if (off && !wasOff) incidents.push(at());
    wasOff = off;
  }
  const best = findLap(state, 'bot')!.bestLap;
  if (!best) throw new Error(`${definition.name}: the ${level} bot never completed a valid lap`);
  return {
    lap: best.ticks / TICK_RATE,
    sectors: best.sectors.map((s) => s / TICK_RATE),
    wallHits,
    offTicks,
    resets,
    incidents,
  };
}

const circuit = circuitById(process.argv[2] ?? '');
const profile = readJson<CircuitProfile>(profilePath(circuit.id));
const target = profile.pole.time;
const fixed = process.argv[3] ? Number(process.argv[3]) : null;

let scale = fixed ?? circuit.scale;
for (let attempt = 0; ; attempt++) {
  const { lap } = measure(generate(profile, circuit, scale).definition, 'hard', target);
  const error = lap / target - 1;
  console.log(`scale ${scale.toFixed(4)}: Hard ${lap.toFixed(2)} s (${(error * 100).toFixed(2)}%)`);
  if (fixed !== null || Math.abs(error) < TOLERANCE || attempt === 8) break;
  scale = scale / (1 + error);
}

const { definition, adapted } = generate(profile, circuit, scale);
const track = buildTrack(definition);
const fmt = (s: number): string => s.toFixed(2).padStart(6);
console.log(
  `\n${circuit.name} at scale ${scale.toFixed(4)}: ${Math.round(track.length)} m ` +
    `(real ${Math.round(profile.length)} m), ${definition.points.length} control points, ` +
    `width ${definition.minWidth}–${Math.max(...definition.points.map((p) => p.width))} m; ` +
    `${adapted.moved} stations moved for the game's limits`,
);
console.log(`Real pole  ${fmt(target)} s  sectors ${profile.pole.sectors.map(fmt).join(' ')}`);
for (const level of [...BOT_LEVELS].reverse()) {
  const m = measure(definition, level, target);
  console.log(
    `${level.padEnd(6)}     ${fmt(m.lap)} s  sectors ${m.sectors.map(fmt).join(' ')}` +
      `  walls ${m.wallHits}, off ${(m.offTicks / TICK_RATE).toFixed(1)} s, resets ${m.resets}`,
  );
  if (m.incidents.length > 0) {
    const real = m.incidents.map((d) => Math.round(d / scale));
    console.log(`           incidents at (m from the line, real scale): ${real.join(', ')}`);
  }
}
