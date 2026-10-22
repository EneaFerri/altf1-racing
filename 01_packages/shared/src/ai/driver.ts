import { BOT_DRIVER } from '../config/bot';
import { TICK_RATE } from '../config/sim';
import { wrapAngle } from '../math/angle';
import { dot, forward, headingOf, sub } from '../math/vec2';
import type { CarState } from '../sim/car';
import { locateOnTrack } from '../track/query';
import type { Track } from '../track/types';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import type { BotPlan } from './plan';

/** What a bot remembers between ticks. Plain data, kept by whoever drives the bot (client or server). */
export interface BotMemory {
  /** Consecutive ticks spent nearly stopped. */
  readonly stuckTicks: number;
}

export const NEW_BOT_MEMORY: BotMemory = { stuckTicks: 0 };

/**
 * One tick of bot driving: the same `InputCommand` a player would send, so the simulation treats
 * bots and players alike. Steers at a point of the racing line ahead, throttles or brakes towards
 * the planned speed, and resets (like R) when stuck. Pure and deterministic.
 */
export function botInput(
  car: CarState,
  plan: BotPlan,
  memory: BotMemory,
): { input: InputCommand; memory: BotMemory } {
  const speed = dot(car.velocity, forward(car.heading));
  const stuckTicks = speed < BOT_DRIVER.stuckSpeed ? memory.stuckTicks + 1 : 0;
  if (stuckTicks >= BOT_DRIVER.stuckSeconds * TICK_RATE) {
    return { input: { ...NEUTRAL_INPUT, reset: true }, memory: NEW_BOT_MEMORY };
  }

  // The plan's own road (a route through a branch, for a bot taking shortcuts).
  const track = plan.road;
  const here = locateOnTrack(track, car.position).index;
  const travel = Math.max(0, speed);
  const aim =
    plan.line[
      indexAhead(track, here, BOT_DRIVER.lookAheadBase + travel * BOT_DRIVER.lookAheadTime)
    ]!;
  const target = plan.speed[indexAhead(track, here, travel * BOT_DRIVER.speedLookAheadTime)]!;

  // Heading grows to the left and steer +1 is right, hence the minus sign.
  const error = wrapAngle(headingOf(sub(aim, car.position)) - car.heading);
  const steer = Math.max(-1, Math.min(1, -error * BOT_DRIVER.steerGain));

  const gap = target - speed;
  const brake = gap < -1 ? Math.min(1, -gap / 4) : 0;
  const input: InputCommand = {
    ...NEUTRAL_INPUT,
    steer,
    throttle: brake === 0 && gap > 0 ? 1 : 0,
    brake,
  };
  return { input, memory: { stuckTicks } };
}

/** Index of the centreline sample `metres` ahead of sample `index`, wrapping over the start line. */
function indexAhead(track: Track, index: number, metres: number): number {
  const n = track.samples.length;
  const steps = Math.round((metres * n) / track.length);
  return (index + steps) % n;
}
