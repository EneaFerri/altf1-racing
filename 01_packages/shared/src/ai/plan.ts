import { BOT_DRIVER, type BotParams } from '../config/bot';
import type { CarParams } from '../config/car';
import { wrapAngle } from '../math/angle';
import { add, distance, dot, headingOf, scale, sub, type Vec2 } from '../math/vec2';
import type { Track } from '../track/types';

/**
 * What a bot aims for at each centreline sample of the road it drives. Pure data, rebuilt when
 * params change.
 */
export interface BotPlan {
  /** The closed road the bot drives: the main loop, or a route through a branch (`shortcuts`). */
  readonly road: Track;
  /** Racing line: signed offset from the centreline (m, + = right), per sample. */
  readonly lateral: readonly number[];
  /** Racing line points (centreline + lateral), per sample. */
  readonly line: readonly Vec2[];
  /** Highest speed to carry through each sample (m/s), braking zones included. */
  readonly speed: readonly number[];
}

/** The bot's car: the player's `CarParams` with `performance` applied to acceleration and top speed. */
export function botCarParams(car: CarParams, bot: BotParams): CarParams {
  return {
    ...car,
    engineAccel: car.engineAccel * bot.performance,
    maxSpeed: car.maxSpeed * bot.performance,
  };
}

/**
 * Builds a bot's racing line and speed profile for `track`:
 * 1. the racing line: the centreline pulled straight, outside → apex → outside, within `lineCut` of
 *    the usable half-width (see `relaxLine`);
 * 2. the speed through each point is what the car can turn at there (from `CarParams`, so retuning
 *    the car keeps bots valid), scaled by `cornerSpeed` and capped by `topSpeed`;
 * 3. a backward pass makes the bot brake in time (`brakeUse` of `brakeDecel`) for what comes next.
 * `player` is the player's car; the bot's own car (`botCarParams`) is derived from it.
 */
export function buildBotPlan(track: Track, player: CarParams, bot: BotParams): BotPlan {
  return planRoad(bot.shortcuts ? (track.routes[0] ?? track) : track, player, bot);
}

function planRoad(track: Track, player: CarParams, bot: BotParams): BotPlan {
  const car = botCarParams(player, bot);
  const n = track.samples.length;
  const at = <T>(list: readonly T[], i: number): T => list[((i % n) + n) % n]!;

  const lateral = relaxLine(track, bot.lineCut);
  const line = track.samples.map((s, i) => add(s.position, scale(s.normal, lateral[i]!)));

  const topSpeed = bot.topSpeed * car.maxSpeed;
  const curvature = line.map((_, i) => lineCurvature(line, i, at));
  const speed = curvature.map((k) => Math.min(topSpeed, cornerSpeed(Math.abs(k), car, bot)));

  // Braking: going backwards round the loop (twice, so the start line wraps), no point may need
  // more deceleration than planned to reach the next one's speed.
  const decel = bot.brakeUse * car.brakeDecel;
  for (let pass = 0; pass < 2 * n; pass++) {
    const i = n - 1 - (pass % n);
    const next = (i + 1) % n;
    const reachable = Math.sqrt(speed[next]! ** 2 + 2 * decel * distance(line[i]!, line[next]!));
    if (reachable < speed[i]!) speed[i] = reachable;
  }
  return { road: track, lateral, line, speed };
}

/** Signed curvature (1/m, + = right) of the racing line at point `i`, over two samples each side. */
function lineCurvature(
  line: readonly Vec2[],
  i: number,
  at: (list: readonly Vec2[], i: number) => Vec2,
): number {
  const before = sub(at(line, i), at(line, i - 2));
  const after = sub(at(line, i + 2), at(line, i));
  const arc = (distance(at(line, i - 2), at(line, i)) + distance(at(line, i), at(line, i + 2))) / 2;
  // Heading decreases when turning right, so negate to make right turns positive.
  return arc > 0 ? -wrapAngle(headingOf(after) - headingOf(before)) / arc : 0;
}

/**
 * Highest speed at which the car's grip-mode yaw rate can follow `curvature`, using `cornerSpeed`
 * of it. Yaw at speed v is `maxYawRate · (1 − highSpeedSteerLoss · v / maxSpeed)`, and following
 * the curve needs `v · curvature`: solving the equality for v gives the formula below.
 */
function cornerSpeed(curvature: number, car: CarParams, bot: BotParams): number {
  const yaw = bot.cornerSpeed * car.maxYawRate;
  return yaw / (curvature + (yaw * car.highSpeedSteerLoss) / car.maxSpeed);
}

/**
 * Racing line as signed offsets from the centreline. Starts on the centreline and repeatedly moves
 * every point to the midpoint of its neighbours `lineSpan` m before and after (projected back onto
 * the sample's normal), like a string pulled tight between the track edges: the result runs
 * outside → apex → outside and has the lowest curvature the allowed width permits.
 * The width allowed is `cut` of each sample's half-width minus `edgeMargin`.
 */
function relaxLine(track: Track, cut: number): number[] {
  const samples = track.samples;
  const n = samples.length;
  const span = Math.max(1, Math.round((BOT_DRIVER.lineSpan * n) / track.length));
  const room = samples.map((s) => cut * Math.max(0, s.halfWidth - BOT_DRIVER.edgeMargin));
  const lateral = samples.map(() => 0);
  const point = (i: number): Vec2 => {
    const j = ((i % n) + n) % n;
    return add(samples[j]!.position, scale(samples[j]!.normal, lateral[j]!));
  };
  for (let iteration = 0; iteration < BOT_DRIVER.lineIterations; iteration++) {
    for (let i = 0; i < n; i++) {
      const mid = scale(add(point(i - span), point(i + span)), 0.5);
      const offset = dot(sub(mid, samples[i]!.position), samples[i]!.normal);
      lateral[i] = Math.max(-room[i]!, Math.min(room[i]!, offset));
    }
  }
  return lateral;
}
