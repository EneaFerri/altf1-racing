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
import { createLapState, stepLap, type LapState } from './laps';
import { carSurface } from './surface';

/** Complete simulation state. Plain data only, so it can be copied, compared and sent over the network. */
export interface GameState {
  /** Number of fixed steps simulated so far. */
  readonly tick: number;
  /** Sorted by id, so every machine updates them in the same order. */
  readonly cars: readonly CarState[];
  /** Impacts that happened during the last tick only (empty most of the time). */
  readonly impacts: readonly ImpactEvent[];
  /** Lap timing, one per car, in the same order as `cars`. */
  readonly laps: readonly LapState[];
}

/** Static data the simulation reads but never changes. Not part of GameState (not cloned, not sent). */
export interface SimContext {
  readonly track: Track;
  readonly carParams: CarParams;
  /** Cars that drive a different car than `carParams` (e.g. a bot with a performance edge). */
  readonly carParamsById?: Readonly<Record<CarId, CarParams>>;
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
  const sorted = sortById(cars);
  return {
    tick: 0,
    cars: sorted,
    impacts: [],
    laps: sorted.map((car) => createLapState(car.id, locateOnTrack(track, car.position).distance)),
  };
}

/**
 * Advances the simulation by exactly one fixed tick. Pure: never mutates `state`.
 * Every car moves first, then one collision pass resolves walls and car-vs-car contacts,
 * then lap timing reads where each car ended up.
 */
export function stepGame(state: GameState, inputs: InputMap, ctx: SimContext): GameState {
  const moved = state.cars.map((car) => {
    const input = inputs[car.id] ?? NEUTRAL_INPUT;
    if (input.reset) return resetOnTrack(car, ctx.track);

    const { surfaces, effect } = carSurface(ctx.track, car, ctx.surfaceParams);
    const params = ctx.carParamsById?.[car.id] ?? ctx.carParams;
    return { ...stepCar(car, input, params, FIXED_DT, effect), wheelSurfaces: surfaces };
  });
  const { cars, impacts } = resolveCollisions(moved, ctx.track, ctx.collisionParams);
  const tick = state.tick + 1;
  const laps = state.laps.map((lap, i) =>
    stepLap(
      lap,
      locateOnTrack(ctx.track, cars[i]!.position).distance,
      inputs[lap.carId]?.reset ?? false,
      tick,
      ctx.track,
    ),
  );
  return { tick, cars, impacts, laps };
}

export function findCar(state: GameState, id: CarId): CarState | undefined {
  return state.cars.find((car) => car.id === id);
}

export function findLap(state: GameState, id: CarId): LapState | undefined {
  return state.laps.find((lap) => lap.carId === id);
}

/**
 * Puts car `id` at rest on the centreline `metres` along the track from car `targetId` (negative =
 * behind), facing the driving direction, with its timing back to an out-lap. Adds the car if it
 * isn't in the race yet. Returns `state` unchanged if `targetId` is missing.
 * Used to bring the bot in and to park the dev dummy.
 */
export function placeCar(
  state: GameState,
  track: Track,
  id: CarId,
  targetId: CarId,
  metres: number,
): GameState {
  const target = findCar(state, targetId);
  if (!target) return state;
  const n = track.samples.length;
  // Start from the main-loop sample at the target's progress (the target may be on a branch).
  const progress = locateOnTrack(track, target.position).distance;
  const start = track.samples.reduce(
    (best, s, i) =>
      Math.abs(s.distance - progress) < Math.abs(track.samples[best]!.distance - progress)
        ? i
        : best,
    0,
  );
  const step = metres >= 0 ? 1 : n - 1;
  let index = start;
  // Walk sample by sample in the chosen direction, wrapping over the start line.
  while (
    (Math.sign(metres) * (track.samples[index]!.distance - track.samples[start]!.distance) +
      track.length) %
      track.length <
    Math.abs(metres)
  ) {
    index = (index + step) % n;
    if (index === start) break;
  }
  const sample = track.samples[index]!;
  const placed = createCar({ id, position: sample.position, heading: headingOf(sample.tangent) });
  // A teleport must not count as crossing a sector: the moved car starts a fresh out-lap.
  const timing = createLapState(id, sample.distance);
  const others = state.cars.filter((car) => car.id !== id);
  const cars = sortById([...others, placed]);
  const laps = cars.map((car) =>
    car.id === id ? timing : state.laps.find((lap) => lap.carId === car.id)!,
  );
  return { ...state, cars, laps };
}

/** Takes car `id` out of the race (no-op if it isn't there). */
export function removeCar(state: GameState, id: CarId): GameState {
  return {
    ...state,
    cars: state.cars.filter((car) => car.id !== id),
    laps: state.laps.filter((lap) => lap.carId !== id),
  };
}

/** Puts a car back on the centreline at its nearest point, facing the driving direction, at rest. */
function resetOnTrack(car: CarState, track: Track): CarState {
  const location = locateOnTrack(track, car.position);
  return createCar({ id: car.id, position: location.point, heading: headingOf(location.tangent) });
}

function sortById(cars: readonly CarState[]): CarState[] {
  return [...cars].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
