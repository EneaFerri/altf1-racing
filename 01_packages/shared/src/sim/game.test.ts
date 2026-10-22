import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { SURFACE_PARAMS } from '../config/surfaces';
import { distance, dot, forward, headingOf, scale, add } from '../math/vec2';
import { buildTrack } from '../track/buildTrack';
import { TEST_TRACK } from '../track/layouts/testTrack';
import { locateOnTrack } from '../track/query';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import {
  createGame,
  findCar,
  findLap,
  placeCar,
  removeCar,
  stepGame,
  type GameState,
  type InputMap,
  type SimContext,
} from './game';

const track = buildTrack(TEST_TRACK);
const ctx: SimContext = {
  track,
  carParams: CAR_PARAMS,
  surfaceParams: SURFACE_PARAMS,
  collisionParams: COLLISION_PARAMS,
};
const THROTTLE: InputCommand = { ...NEUTRAL_INPUT, throttle: 1 };

function run(state: GameState, inputs: InputMap, ticks: number, context = ctx): GameState {
  for (let i = 0; i < ticks; i++) state = stepGame(state, inputs, context);
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

  it('keeps a car flat out into the barriers inside the walls, and reports the hits', () => {
    let state = createGame(track, ['player']);
    let hits = 0;
    for (let tick = 0; tick < 600; tick++) {
      state = stepGame(state, { player: { ...THROTTLE, steer: -1 } }, ctx);
      hits += state.impacts.length;
      const location = locateOnTrack(track, findCar(state, 'player')!.position);
      expect(Math.abs(location.lateral)).toBeLessThan(location.halfWidth + track.runoffWidth);
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('placeCar parks a car on the centreline ahead of another, at rest', () => {
    const start = run(createGame(track, ['player', 'dummy']), { player: THROTTLE }, 60);
    const player = findCar(start, 'player')!;
    const dummy = findCar(placeCar(start, track, 'dummy', 'player', 25), 'dummy')!;
    const ahead =
      (locateOnTrack(track, dummy.position).distance -
        locateOnTrack(track, player.position).distance +
        track.length) %
      track.length;
    expect(ahead).toBeGreaterThan(24);
    expect(ahead).toBeLessThan(28);
    expect(dummy.velocity).toEqual({ x: 0, z: 0 });
    expect(Math.abs(locateOnTrack(track, dummy.position).lateral)).toBeLessThan(0.01);
  });

  it('placeCar adds a missing car behind another, and removeCar takes it out again', () => {
    const start = createGame(track, ['player']);
    const added = placeCar(start, track, 'bot', 'player', -40);
    expect(added.cars.map((c) => c.id)).toEqual(['bot', 'player']);
    expect(added.laps.map((l) => l.carId)).toEqual(['bot', 'player']);
    const behind =
      (locateOnTrack(track, findCar(start, 'player')!.position).distance -
        locateOnTrack(track, findCar(added, 'bot')!.position).distance +
        track.length) %
      track.length;
    expect(behind).toBeGreaterThan(38);
    expect(behind).toBeLessThan(43);
    expect(removeCar(added, 'bot')).toEqual(start);
  });

  it('times every car: out-lap on the grid, lap 1 starts on the line', () => {
    const start = createGame(track, ['player', 'rival']);
    expect(start.laps.map((l) => l.carId)).toEqual(['player', 'rival']);
    expect(findLap(start, 'player')!.sector).toBe(-1);
    // Full throttle off the grid crosses the line (10 m ahead) within 2 s.
    const moving = run(start, { player: THROTTLE }, 120);
    expect(findLap(moving, 'player')!.sector).toBe(0);
    expect(findLap(moving, 'player')!.lapStartTick).toBeGreaterThan(0);
    expect(findLap(moving, 'rival')!.sector).toBe(-1);
  });

  it('drives each car with its own params when given (carParamsById)', () => {
    const faster = { ...CAR_PARAMS, engineAccel: CAR_PARAMS.engineAccel * 1.2 };
    const start = createGame(track, ['player', 'rival']);
    const inputs = { player: THROTTLE, rival: THROTTLE };
    const end = run(start, inputs, 1, { ...ctx, carParamsById: { rival: faster } });
    const speed = (id: string): number =>
      dot(findCar(end, id)!.velocity, forward(findCar(end, id)!.heading));
    expect(speed('rival')).toBeCloseTo(speed('player') * 1.2, 5);
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
