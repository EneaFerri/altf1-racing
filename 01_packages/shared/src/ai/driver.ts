import { BOT_DRIVER } from '../config/bot';
import { TICK_RATE } from '../config/sim';
import { wrapAngle } from '../math/angle';
import { dot, forward, headingOf, sub } from '../math/vec2';
import type { CarState } from '../sim/car';
import { locateOnTrack } from '../track/query';
import type { Track } from '../track/types';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import { gripYawRate, type BotPlan } from './plan';

/** What a bot remembers between ticks. Plain data, kept by whoever drives the bot (client or server). */
export interface BotMemory {
  /** Consecutive ticks spent nearly stopped. */
  readonly stuckTicks: number;
}

export const NEW_BOT_MEMORY: BotMemory = { stuckTicks: 0 };

/**
 * One tick of bot driving: the same `InputCommand` a player would send, so the simulation treats
 * bots and players alike. Steers at a point of the racing line ahead, throttles or brakes towards
 * the planned speed, drifts (Space) where the plan says so, and resets (like R) when stuck.
 * Pure and deterministic.
 */
export function botInput(
  car: CarState,
  plan: BotPlan,
  track: Track,
  memory: BotMemory,
): { input: InputCommand; memory: BotMemory } {
  const speed = dot(car.velocity, forward(car.heading));
  const stuckTicks = speed < BOT_DRIVER.stuckSpeed ? memory.stuckTicks + 1 : 0;
  if (stuckTicks >= BOT_DRIVER.stuckSeconds * TICK_RATE) {
    return { input: { ...NEUTRAL_INPUT, reset: true }, memory: NEW_BOT_MEMORY };
  }

  const here = locateOnTrack(track, car.position).index;
  const travel = Math.max(0, speed);
  const aim =
    plan.line[
      indexAhead(track, here, BOT_DRIVER.lookAheadBase + travel * BOT_DRIVER.lookAheadTime)
    ]!;
  const next = indexAhead(track, here, travel * BOT_DRIVER.speedLookAheadTime);
  const target = plan.speed[next]!;
  const curve = plan.curvature[indexAhead(track, here, travel * BOT_DRIVER.driftLookAheadTime)]!;
  const drift = wantsDrift(car, plan, curve, travel);

  // In a drift the nose points into the corner, so aim with the direction of travel instead.
  const facing = car.drifting ? headingOf(car.velocity) : car.heading;
  // Heading grows to the left and steer +1 is right, hence the minus sign.
  const error = wrapAngle(headingOf(sub(aim, car.position)) - facing);
  let steer = Math.max(-1, Math.min(1, -error * BOT_DRIVER.steerGain));
  if (drift && !car.drifting) {
    steer = Math.sign(curve); // entry: full lock into the corner locks the drift's side
  } else if (drift) {
    steer = driftSteer(car, plan, curve, travel, error);
  }

  const gap = target - speed;
  const input: InputCommand = {
    ...NEUTRAL_INPUT,
    steer,
    handbrake: drift,
    throttle: gap > 0 ? 1 : 0,
    // Brake only when moving: at a standstill the brake key would engage reverse.
    brake: gap < -1 && speed > 1 ? Math.min(1, -gap / 4) : 0,
  };
  return { input, memory: { stuckTicks } };
}

/**
 * Drift when grip alone can't turn the car as fast as the corner ahead needs at the current speed,
 * and the drift can (it never turns slower than `driftTurnRate · (1 − driftSteerInfluence)`).
 * Once drifting, keep going while the corner still needs most of that, on the same side.
 */
function wantsDrift(car: CarState, plan: BotPlan, curve: number, speed: number): boolean {
  const c = plan.car;
  if (plan.bot.driftUse <= 0 || speed < c.driftMinSpeed) return false;
  const need = Math.abs(curve) * speed;
  const slowest = c.driftTurnRate * (1 - c.driftSteerInfluence);
  if (car.drifting) {
    return Math.sign(curve) === car.driftDirection && need >= slowest * BOT_DRIVER.driftKeepShare;
  }
  return need >= slowest && need > gripYawRate(c, speed) * plan.bot.cornerSpeed;
}

/**
 * Steering inside a drift: picks how much to tighten (into) or widen (counter) the drift so the
 * direction of travel turns as fast as the corner needs, plus a correction towards the aim point.
 */
function driftSteer(
  car: CarState,
  plan: BotPlan,
  curve: number,
  speed: number,
  error: number,
): number {
  const c = plan.car;
  // + = the aim point lies further into the drift's turn.
  const into = -error * car.driftDirection;
  const wanted = Math.abs(curve) * speed + BOT_DRIVER.driftAimGain * into;
  const steerInto = (wanted / c.driftTurnRate - 1) / c.driftSteerInfluence;
  return Math.max(-1, Math.min(1, steerInto)) * car.driftDirection;
}

/** Index of the centreline sample `metres` ahead of sample `index`, wrapping over the start line. */
function indexAhead(track: Track, index: number, metres: number): number {
  const n = track.samples.length;
  const steps = Math.round((metres * n) / track.length);
  return (index + steps) % n;
}
