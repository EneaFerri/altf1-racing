import type { PitParams } from '../config/pit';
import { TICK_RATE } from '../config/sim';
import { add, headingOf, length, scale, ZERO, type Vec2 } from '../math/vec2';
import { locateOnLoop, locateOnTrack } from '../track/query';
import type { PitLaneRules, Track } from '../track/types';
import type { CarId, CarState } from './car';
import { NO_DAMAGE, type CarDamage } from './damage';

/**
 * A car's pit stop (Phase 4: the Grand Prix; 01_docs/pitlane.md#pit-stop-4g): held in its box
 * until tick `until`; from then on it has stopped on this pass through the pits, until it leaves
 * the lane.
 */
export interface PitStop {
  readonly until: number;
}

/** The pit lane's rules of a race (`SimContext.pit`): its parameters and each car's box. */
export interface PitRules {
  readonly params: PitParams;
  /** Box index (into `PitLaneRules.boxes`) per car; a car without one never stops. */
  readonly boxes: Readonly<Record<CarId, number>>;
}

/** Where a point is on the pit lane: its route, rules and own distance along it; null off it. */
export interface PitLanePlace {
  readonly road: Track;
  readonly rules: PitLaneRules;
  readonly distance: number;
}

export function pitLanePlace(track: Track, p: Vec2): PitLanePlace | null {
  const route = track.routes.findIndex((road) => road.pit);
  if (route < 0 || locateOnTrack(track, p).route !== route) return null;
  const road = track.routes[route]!;
  return { road, rules: road.pitRules!, distance: locateOnLoop(road, p).distance };
}

/** Whether `place` is between the pit lane's limit lines. */
export function inLimit(place: PitLanePlace | null): boolean {
  return (
    place !== null &&
    place.distance >= place.rules.limitFrom &&
    place.distance <= place.rules.limitTo
  );
}

/** A stop's length in ticks: the tyres every time, each wing by its damage. */
export function stopTicks(damage: CarDamage | undefined, p: PitParams): number {
  const { frontWing, rearWing } = damage ?? NO_DAMAGE;
  return Math.round(
    (p.tyresTime + frontWing * p.frontWingTime + rearWing * p.rearWingTime) * TICK_RATE,
  );
}

/** Where a car stands in box `box`: beside the lane's centre, towards the garages, facing along it. */
export function boxSpot(
  road: Track,
  box: number,
  p: PitParams,
): { position: Vec2; heading: number } {
  const rules = road.pitRules!;
  const at = rules.boxes[box % rules.boxes.length]!;
  const n = road.samples.length;
  const i = road.samples.findIndex((s, k) => k + 1 < n && road.samples[k + 1]!.distance > at);
  const s = road.samples[Math.max(0, i)]!;
  const offset = rules.garageSide * p.boxSide * s.halfWidth;
  return { position: add(s.position, scale(s.normal, offset)), heading: headingOf(s.tangent) };
}

/** `car` held still in its box: it doesn't move and its controls do nothing. */
export function heldInBox(car: CarState): CarState {
  return { ...car, velocity: ZERO, yawRate: 0, spin: 0, steer: 0, brakePressure: 0 };
}

/** Whether `car` is stopped in its box at the step from `tick`. */
export function inBox(car: CarState, tick: number): boolean {
  return car.pitStop !== undefined && tick < car.pitStop.until;
}

/** `car` after moving: no faster than the limit between the limit lines (the automatic limiter). */
export function limitedSpeed(car: CarState, track: Track): CarState {
  const place = pitLanePlace(track, car.position);
  if (!inLimit(place)) return car;
  const speed = length(car.velocity);
  const limit = place!.rules.speedLimit;
  return speed > limit ? { ...car, velocity: scale(car.velocity, limit / speed) } : car;
}

/**
 * `car`'s pit stop at the end of the step to `tick`: released (repaired: as new) when its stop
 * ends; its stop forgotten once it has left the lane; else, slow enough at its own box, stopped
 * there for `stopTicks`.
 */
export function pitStep(car: CarState, track: Track, tick: number, pit: PitRules): CarState {
  if (car.pitStop) {
    if (tick === car.pitStop.until) return car.damage ? { ...car, damage: NO_DAMAGE } : car;
    if (tick > car.pitStop.until && !pitLanePlace(track, car.position)) return withoutStop(car);
    return car;
  }
  const box = pit.boxes[car.id];
  if (box === undefined || length(car.velocity) > pit.params.boxSpeed) return car;
  const place = pitLanePlace(track, car.position);
  if (!place) return car;
  const at = place.rules.boxes[box % place.rules.boxes.length]!;
  if (Math.abs(place.distance - at) > pit.params.boxReach) return car;
  const { position, heading } = boxSpot(place.road, box, pit.params);
  return {
    ...heldInBox(car),
    position,
    heading,
    pitStop: { until: tick + stopTicks(car.damage, pit.params) },
  };
}

/** `car` without its pit stop: it has left the lane. */
function withoutStop({ pitStop: _done, ...car }: CarState): CarState {
  return car;
}

/** What a car's driver sees of the pit lane: the limiter, and a stop's seconds left. */
export interface PitStatus {
  readonly limiter: boolean;
  /** Speed limit there (m/s). */
  readonly speedLimit: number;
  /** Seconds left of the stop in its box; null when not stopped. */
  readonly stopLeft: number | null;
}

/** `car`'s pit lane status at `tick`; null off the pit lane. */
export function pitStatus(track: Track, car: CarState, tick: number): PitStatus | null {
  const place = pitLanePlace(track, car.position);
  if (!place) return null;
  return {
    limiter: inLimit(place),
    speedLimit: place.rules.speedLimit,
    stopLeft: inBox(car, tick) ? (car.pitStop!.until - tick) / TICK_RATE : null,
  };
}
