import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { SURFACE_PARAMS } from '../config/surfaces';
import { distance, dot, forward, headingOf, scale, add } from '../math/vec2';
import { buildTrack } from '../track/buildTrack';
import { TEST_TRACK } from '../track/layouts/testTrack';
import { locateOnTrack } from '../track/query';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import {
  createGame,
  findCar,
  stepGame,
  type GameState,
  type InputMap,
  type SimContext,
} from './game';

const track = buildTrack(TEST_TRACK);
const ctx: SimContext = { track, carParams: CAR_PARAMS, surfaceParams: SURFACE_PARAMS };
const THROTTLE: InputCommand = { ...NEUTRAL_INPUT, throttle: 1 };

function run(state: GameState, inputs: InputMap, ticks: number): GameState {
  for (let i = 0; i < ticks; i++) state = stepGame(state, inputs, ctx);
  return state;
}

describe('createGame', () => {
  it('puts every car on the grid, sorted by id, facing the driving direction', () => {
    const state = createGame(track, ['player', 'alpha']);
    expect(state.cars.map((c) => c.id)).toEqual(['alpha', 'player']);
    const [a, b] = state.cars;
    expect(distance(a!.position, b!.position)).toBeGreaterThan(4);
    for (const car of state.cars) {
      const location = locateOnTrack(track, car.position);
      expect(Math.abs(location.lateral)).toBeLessThan(location.halfWidth);
      expect(dot(forward(car.heading), locateOnTrack(track, car.position).tangent)).toBeGreaterThan(
        0.99,
      );
    }
  });
});

describe('stepGame', () => {
  it('advances the tick and every car; cars without input coast', () => {
    const state = run(createGame(track, ['player', 'other']), { player: THROTTLE }, 60);
    expect(state.tick).toBe(60);
    expect(findCar(state, 'player')!.velocity).not.toEqual({ x: 0, z: 0 });
    expect(findCar(state, 'other')!.velocity).toEqual({ x: 0, z: 0 });
  });

  it('does not mutate the previous state', () => {
    const prev = createGame(track, ['player']);
    const snapshot = JSON.parse(JSON.stringify(prev));
    stepGame(prev, { player: THROTTLE }, ctx);
    expect(prev).toEqual(snapshot);
  });

  it('records the surface under each wheel', () => {
    const state = run(createGame(track, ['player']), {}, 1);
    expect(findCar(state, 'player')!.wheelSurfaces).toEqual([
      'asphalt',
      'asphalt',
      'asphalt',
      'asphalt',
    ]);
  });

  it('reset puts the car back on the centreline, facing the track, at rest', () => {
    const start = createGame(track, ['player']);
    const car = start.cars[0]!;
    const lost: GameState = {
      ...start,
      cars: [
        {
          ...car,
          position: add(car.position, scale(track.samples[0]!.normal, 14)),
          heading: 2,
          velocity: scale(forward(2), 20),
        },
      ],
    };
    const reset = findCar(
      stepGame(lost, { player: { ...NEUTRAL_INPUT, reset: true } }, ctx),
      'player',
    )!;
    const location = locateOnTrack(track, reset.position);
    expect(Math.abs(location.lateral)).toBeLessThan(0.01);
    expect(reset.heading).toBeCloseTo(headingOf(location.tangent));
    expect(reset.velocity).toEqual({ x: 0, z: 0 });
  });

  it('is deterministic with several cars on the track', () => {
    const script = (tick: number): InputMap => ({
      player: { ...THROTTLE, steer: Math.sin(tick / 50) > 0 ? 1 : -1, handbrake: tick % 240 > 180 },
      rival: { ...THROTTLE, steer: tick % 100 < 50 ? 0.5 : -0.5 },
    });
    const simulate = (): GameState => {
      let state = createGame(track, ['player', 'rival']);
      for (let tick = 0; tick < 900; tick++) state = stepGame(state, script(tick), ctx);
      return state;
    };
    expect(simulate()).toEqual(simulate());
  });
});
