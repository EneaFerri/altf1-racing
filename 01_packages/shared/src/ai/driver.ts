import { BOT_DRIVER } from '../config/bot';
import { TICK_RATE } from '../config/sim';
import { wrapAngle } from '../math/angle';
import { add, dot, forward, headingOf, length, scale, sub, type Vec2 } from '../math/vec2';
import type { CarState } from '../sim/car';
import { locateOnLoop, locateOnTrack } from '../track/query';
import type { Track } from '../track/types';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import type { BotPlan } from './plan';

/** What a bot remembers between ticks. Plain data, kept by whoever drives the bot (client or server). */
export interface BotMemory {
  /** Consecutive ticks spent nearly stopped. */
  readonly stuckTicks: number;
  /** How far the bot has moved off its racing line to pass a car (m, + = right). */
  readonly offset: number;
}

export const NEW_BOT_MEMORY: BotMemory = { stuckTicks: 0, offset: 0 };

/** Another car as a bot sees it, on its road. */
interface Traffic {
  /** Metres ahead along the road (negative = behind), the shorter way round. */
  readonly gap: number;
  /** Its offset from the centreline (m, + = right). */
  readonly lateral: number;
  /** Its speed along the road (m/s). */
  readonly speed: number;
  /**
   * How close sideways (m, centre to centre) it may be passed: `carWidth`, or `parkedWidth` for a
   * car held in its pit box (still, and off to the garages' side of the lane).
   */
  readonly width: number;
}

/**
 * One tick of bot driving: the same `InputCommand` a player would send, so the simulation treats
 * bots and players alike. Steers at a point of the racing line ahead, throttles or brakes towards
 * the planned speed, and resets (like R) when stuck. In traffic (`others`: every car on track, the
 * bot itself included or not) it never runs into a car ahead on its line (its speed capped to what
 * it can still brake from), moves off its line to the side with more room to pass a slower one,
 * coming back once clear, and keeps to its side of a car alongside (never aims into it). Alone on the track it drives exactly as without `others`. Pure and
 * deterministic.
 */
export function botInput(
  car: CarState,
  plan: BotPlan,
  memory: BotMemory,
  others: readonly CarState[] = [],
): { input: InputCommand; memory: BotMemory } {
  const speed = dot(car.velocity, forward(car.heading));
  // Held in its pit box (or just leaving it) is not stuck.
  const stuckTicks = speed < BOT_DRIVER.stuckSpeed && !car.pitStop ? memory.stuckTicks + 1 : 0;
  if (stuckTicks >= BOT_DRIVER.stuckSeconds * TICK_RATE) {
    return { input: { ...NEUTRAL_INPUT, reset: true }, memory: NEW_BOT_MEMORY };
  }

  // The plan's own road (a route through a branch, for a bot taking shortcuts).
  const track = plan.road;
  const self = locateOnTrack(track, car.position);
  const here = self.index;
  const travel = Math.max(0, speed);
  const traffic = trafficAround(track, car, self.distance, others);
  const offset = passOffset(track, plan, here, self.lateral, travel, memory.offset, traffic);
  const aim = aimPoint(
    track,
    plan,
    indexAhead(track, here, BOT_DRIVER.lookAheadBase + travel * BOT_DRIVER.lookAheadTime),
    offset,
    sideRoom(self.lateral, traffic),
  );
  const planned = plan.speed[indexAhead(track, here, travel * BOT_DRIVER.speedLookAheadTime)]!;
  const corner = brakingAhead(track, plan, here, travel);
  const target = Math.min(
    planned,
    trafficSpeed(track, plan, here, self.lateral, offset, traffic, corner),
  );

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
  return { input, memory: { stuckTicks, offset } };
}

/** The other cars on `track` near the bot (`distance` = its own progress); cars off it are left out. */
function trafficAround(
  track: Track,
  car: CarState,
  distance: number,
  others: readonly CarState[],
): Traffic[] {
  const { trafficRange } = BOT_DRIVER;
  return others.flatMap((other) => {
    if (other.id === car.id) return [];
    const loc = locateOnLoop(track, other.position);
    let gap = loc.distance - distance;
    if (gap > track.length / 2) gap -= track.length;
    if (gap < -track.length / 2) gap += track.length;
    // Far away, or off this road (e.g. in the pit lane): not traffic.
    if (Math.abs(gap) > trafficRange || Math.abs(loc.lateral) > loc.halfWidth + 1) return [];
    const parked = other.pitStop !== undefined && length(other.velocity) < 0.5;
    const width = parked ? BOT_DRIVER.parkedWidth : BOT_DRIVER.carWidth;
    return [{ gap, lateral: loc.lateral, speed: dot(other.velocity, loc.tangent), width }];
  });
}

/**
 * The bot's offset from its racing line this tick: towards the side with more room when a car
 * slower than the bot would go (its plan, or its speed now) is ahead on its path, unless a braking
 * zone is close (the pass is given up) (and that side isn't taken by a car alongside), back to the line once
 * nothing is in the way; moved gradually (`passRate`) and kept on the asphalt.
 */
function passOffset(
  track: Track,
  plan: BotPlan,
  here: number,
  lateral: number,
  speed: number,
  offset: number,
  traffic: readonly Traffic[],
): number {
  const { passLookAhead, passLookAheadTime, passRate } = BOT_DRIVER;
  const limit = usableHalfWidth(track, here);
  const path = plan.lateral[here]! + offset;
  const reach = passLookAhead + speed * passLookAheadTime;
  const blocker = traffic
    .filter((t) => t.gap > 0 && t.gap < reach && Math.abs(t.lateral - path) < t.width)
    .filter((t) => {
      // What the bot would do there on its own: held up behind it, it is no faster any more.
      const free = plan.speed[indexAhead(track, here, t.gap)]!;
      return t.speed < Math.max(speed, free) - BOT_DRIVER.passMargin;
    })
    .sort((a, b) => a.gap - b.gap)[0];
  /** Whether a car alongside takes the side `side` (+1 right, -1 left) of the bot. */
  const taken = (side: number): boolean =>
    traffic.some(
      (t) =>
        t !== blocker &&
        Math.abs(t.gap) < BOT_DRIVER.alongside &&
        Math.sign(t.lateral - lateral) === side &&
        Math.abs(t.lateral - lateral) < t.width + 1,
    );
  // A braking zone close ahead: a pass not yet done is given up, the bot tucks in behind.
  const corner = brakingAhead(track, plan, here, speed);
  let wanted = 0;
  // A car that is still (held in its pit box) is passed even into a braking zone: it won't move.
  if (blocker && (!corner || blocker.speed < BOT_DRIVER.stuckSpeed)) {
    const preferred = limit - blocker.lateral >= limit + blocker.lateral ? 1 : -1;
    const side = !taken(preferred) ? preferred : !taken(-preferred) ? -preferred : 0;
    wanted =
      side === 0
        ? offset
        : clamp(blocker.lateral + side * blocker.width, -limit, limit) - plan.lateral[here]!;
  } else if (
    traffic.some(
      (t) => Math.abs(t.gap) < BOT_DRIVER.alongside && Math.abs(t.lateral - lateral) < t.width,
    )
  ) {
    wanted = offset; // side by side: hold the line it has until clear
  }
  const step = passRate / TICK_RATE;
  return offset + clamp(wanted - offset, -step, step);
}

/**
 * The speed the bot may carry with `traffic` around: for each car ahead in its way (sideways
 * closer than `carWidth` to the bot now, or to where its line takes it by that car: a racing line
 * sweeping across into a corner), the speed it can still brake from (`trafficDecel`) to that
 * car's before the gap shrinks to `followGap`; slower than that car once inside it. Into a
 * braking zone (`corner`), slower than a car alongside just ahead: the bot gives way. Infinity with
 * nobody ahead.
 */
function trafficSpeed(
  track: Track,
  plan: BotPlan,
  here: number,
  lateral: number,
  offset: number,
  traffic: readonly Traffic[],
  corner: boolean,
): number {
  const { alongside, followGap, followTime, trafficDecel, yieldDrop } = BOT_DRIVER;
  let allowed = Infinity;
  for (const t of traffic) {
    if (t.gap <= 0) continue;
    // Side by side into a braking zone: the one behind gives way and tucks in.
    if (corner && t.gap < alongside && t.speed > BOT_DRIVER.stuckSpeed) {
      allowed = Math.min(allowed, Math.max(0, t.speed - yieldDrop));
      continue;
    }
    const there = plan.lateral[indexAhead(track, here, t.gap)]! + offset;
    const inTheWay =
      Math.abs(t.lateral - lateral) < t.width || Math.abs(t.lateral - there) < t.width;
    if (!inTheWay) continue;
    // It is about to brake where the line does (a corner ahead of it): count on that speed.
    const ahead = plan.speed[indexAhead(track, here, t.gap)]!;
    const theirs = Math.max(0, Math.min(t.speed, ahead));
    const room = t.gap - followGap - Math.max(0, t.speed) * followTime;
    allowed = Math.min(
      allowed,
      room > 0
        ? Math.sqrt(theirs * theirs + 2 * trafficDecel * room)
        : // Close behind a car held in its box: creep on to steer round it (still, it can't).
          Math.max(t.width === BOT_DRIVER.parkedWidth ? BOT_DRIVER.creepSpeed : 0, theirs - 2),
    );
  }
  return allowed;
}

/** Sideways room (m from the centreline) a bot keeps to: its side of every car alongside. */
interface SideRoom {
  readonly min: number;
  readonly max: number;
}

/**
 * The room left to the bot (at `lateral`) by the cars alongside: it stays at least `carWidth`
 * from each, on the side it is on. Unbounded with nobody alongside, or if they leave no room.
 */
function sideRoom(lateral: number, traffic: readonly Traffic[]): SideRoom {
  const { alongside } = BOT_DRIVER;
  let min = -Infinity;
  let max = Infinity;
  for (const t of traffic) {
    if (Math.abs(t.gap) >= alongside) continue;
    if (lateral >= t.lateral) min = Math.max(min, t.lateral + t.width);
    else max = Math.min(max, t.lateral - t.width);
  }
  return min <= max ? { min, max } : { min: -Infinity, max: Infinity };
}

/**
 * The racing line's point at sample `index`, moved `offset` m sideways, kept in the bot's side
 * `room` and on the asphalt.
 */
function aimPoint(
  track: Track,
  plan: BotPlan,
  index: number,
  offset: number,
  room: SideRoom,
): Vec2 {
  const free = room.min === -Infinity && room.max === Infinity;
  if (offset === 0 && free) return plan.line[index]!;
  const sample = track.samples[index]!;
  // Squeezed by a car alongside, the bot may use the asphalt up to `squeezeEdgeMargin`.
  const limit = free
    ? usableHalfWidth(track, index)
    : Math.max(0, sample.halfWidth - BOT_DRIVER.squeezeEdgeMargin);
  const wanted = clamp(plan.lateral[index]! + offset, room.min, room.max);
  const lateral = clamp(wanted, -limit, limit);
  return add(sample.position, scale(sample.normal, lateral));
}

/** How far from the centreline a bot passing may go at sample `index` (m). */
function usableHalfWidth(track: Track, index: number): number {
  return Math.max(0, track.samples[index]!.halfWidth - BOT_DRIVER.passEdgeMargin);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Whether the bot's line slows down hard close ahead (a braking zone): no time to race side by side. */
function brakingAhead(track: Track, plan: BotPlan, here: number, speed: number): boolean {
  const ahead = plan.speed[indexAhead(track, here, speed * BOT_DRIVER.passAbortTime)]!;
  return ahead < speed - BOT_DRIVER.passAbortDrop;
}

/** Index of the centreline sample `metres` ahead of sample `index`, wrapping over the start line. */
function indexAhead(track: Track, index: number, metres: number): number {
  const n = track.samples.length;
  const steps = Math.round((metres * n) / track.length);
  return (index + steps) % n;
}
