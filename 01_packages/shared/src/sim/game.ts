import type { CarParams } from '../config/car';
import type { CollisionParams } from '../config/collision';
import { FIXED_DT } from '../config/sim';
import type { SurfaceParams } from '../config/surfaces';
import { headingOf } from '../math/vec2';
import { gridSlot, locateOnTrack } from '../track/query';
import type { Surface, Track } from '../track/types';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import { createCar, stepCar, type CarId, type CarState } from './car';
import { resolveCollisions } from './collision/resolve';
import type { ImpactEvent } from './collision/types';
import { carSurface } from './surface';

/** Complete simulation state. Plain data only, so it can be copied, compared and sent over the network. */
export interface GameState {
  /** Number of fixed steps simulated so far. */
  readonly tick: number;
  /** Sorted by id, so every machine updates them in the same order. */
  readonly cars: readonly CarState[];
  /** Impacts that happened during the last tick only (empty most of the time). */
  readonly impacts: readonly ImpactEvent[];
}

/** Static data the simulation reads but never changes. Not part of GameState (not cloned, not sent). */
export interface SimContext {
  readonly track: Track;
  readonly carParams: CarParams;
  readonly surfaceParams: Readonly<Record<Surface, SurfaceParams>>;
  readonly collisionParams: CollisionParams;
}

/** One input per car id; cars without an entry get NEUTRAL_INPUT. */
export type InputMap = Readonly<Record<CarId, InputCommand>>;

/** New race: cars on the starting grid in the given order (first = pole position). */
export function createGame(track: Track, carIds: readonly CarId[]): GameState {
  const cars = carIds.map((id, slot) => {
    const { position, direction } = gridSlot(track, slot);
    return createCar({ id, position, heading: headingOf(direction) });
  });
  return {
    tick: 0,
    cars: [...cars].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    impacts: [],
  };
}

/**
 * Advances the simulation by exactly one fixed tick. Pure: never mutates `state`.
 * Every car moves first, then one collision pass resolves walls and car-vs-car contacts.
 */
export function stepGame(state: GameState, inputs: InputMap, ctx: SimContext): GameState {
  const moved = state.cars.map((car) => {
    const input = inputs[car.id] ?? NEUTRAL_INPUT;
    if (input.reset) return resetOnTrack(car, ctx.track);

    const { surfaces, effect } = carSurface(ctx.track, car, ctx.surfaceParams);
    return { ...stepCar(car, input, ctx.carParams, FIXED_DT, effect), wheelSurfaces: surfaces };
  });
  const { cars, impacts } = resolveCollisions(moved, ctx.track, ctx.collisionParams);
  return { tick: state.tick + 1, cars, impacts };
}

export function findCar(state: GameState, id: CarId): CarState | undefined {
  return state.cars.find((car) => car.id === id);
}

/**
 * Dev tool: puts car `id` at rest on the centreline `metres` ahead of car `targetId` along the track,
 * facing the driving direction. Returns `state` unchanged if either car is missing.
 */
export function placeCarAhead(
  state: GameState,
  track: Track,
  id: CarId,
  targetId: CarId,
  metres: number,
): GameState {
  const target = findCar(state, targetId);
  if (!target || !findCar(state, id)) return state;
  const n = track.samples.length;
  const start = locateOnTrack(track, target.position).index;
  let index = start;
  // Walk forward sample by sample, wrapping over the start line.
  while (
    (track.samples[index]!.distance - track.samples[start]!.distance + track.length) %
      track.length <
    metres
  ) {
    index = (index + 1) % n;
    if (index === start) break;
  }
  const sample = track.samples[index]!;
  const placed = createCar({ id, position: sample.position, heading: headingOf(sample.tangent) });
  return { ...state, cars: state.cars.map((car) => (car.id === id ? placed : car)) };
}

/** Puts a car back on the centreline at its nearest point, facing the driving direction, at rest. */
function resetOnTrack(car: CarState, track: Track): CarState {
  const location = locateOnTrack(track, car.position);
  return createCar({ id: car.id, position: location.point, heading: headingOf(location.tangent) });
}
