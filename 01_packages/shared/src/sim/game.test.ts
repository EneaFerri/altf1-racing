import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { DAMAGE_PARAMS } from '../config/damage';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import { distance, dot, forward, headingOf, right, scale, sub, add } from '../math/vec2';
import { buildTrack } from '../track/buildTrack';
import { GP_TRACKS } from '../track/layouts';
import { createLapState } from './laps';
import { TEST_TRACK } from '../track/layouts/testTrack';
import { gridSlot, locateOnTrack } from '../track/query';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import {
  createGame,
  findCar,
  findLap,
  placeCar,
  removeCar,
  repairCars,
  spawnOnGrid,
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
  slipstreamParams: SLIPSTREAM_PARAMS,
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
      state = stepGame(state, { player: { ...THROTTLE, steer: -0.8 } }, ctx);
      hits += state.impacts.length;
      const location = locateOnTrack(track, findCar(state, 'player')!.position);
      expect(Math.abs(location.lateral)).toBeLessThan(location.halfWidth + track.runoffWidth);
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('tows a car close behind a fast one (slipstream), never the one in front', () => {
    const start = createGame(track, ['follower', 'leader']);
    const leader = findCar(start, 'leader')!;
    const dir = forward(leader.heading);
    const fast = { velocity: scale(dir, 70) };
    const inLine: GameState = {
      ...start,
      cars: [
        { ...leader, ...fast, id: 'follower', position: add(leader.position, scale(dir, -10)) },
        { ...leader, ...fast },
      ],
    };
    const alone: GameState = { ...inLine, cars: [inLine.cars[0]!], laps: [inLine.laps[0]!] };
    const towed = stepGame(inLine, { follower: THROTTLE, leader: THROTTLE }, ctx);
    const untowed = stepGame(alone, { follower: THROTTLE }, ctx);
    const follower = findCar(towed, 'follower')!;
    expect(follower.slipstream).toBeGreaterThan(0.8);
    expect(findCar(towed, 'leader')!.slipstream).toBe(0);
    expect(dot(follower.velocity, dir)).toBeGreaterThan(
      dot(findCar(untowed, 'follower')!.velocity, dir),
    );
  });

  it('spawnOnGrid puts each new car on the first free grid slot, at rest, on an out-lap', () => {
    const empty: GameState = { tick: 0, cars: [], impacts: [], laps: [] };
    const one = spawnOnGrid(empty, track, 'p2');
    expect(findCar(one, 'p2')!.position).toEqual(gridSlot(track, 0).position);
    const two = spawnOnGrid(one, track, 'p1');
    expect(findCar(two, 'p1')!.position).toEqual(gridSlot(track, 1).position);
    expect(two.cars.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(two.laps.map((l) => l.carId)).toEqual(['p1', 'p2']);
    expect(findLap(two, 'p1')!.lapStartTick).toBeNull();
    expect(findCar(two, 'p1')!.velocity).toEqual({ x: 0, z: 0 });
  });

  it('spawnOnGrid reuses a slot once its car has driven away, and replaces an existing id', () => {
    const empty: GameState = { tick: 0, cars: [], impacts: [], laps: [] };
    const gone = run(spawnOnGrid(empty, track, 'p1'), { p1: THROTTLE }, 120);
    const next = spawnOnGrid(gone, track, 'p2');
    expect(findCar(next, 'p2')!.position).toEqual(gridSlot(track, 0).position);
    const again = spawnOnGrid(next, track, 'p1');
    expect(again.cars).toHaveLength(2);
    expect(findCar(again, 'p1')!.position).toEqual(gridSlot(track, 1).position);
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
      player: {
        ...THROTTLE,
        steer: Math.sin(tick / 50) > 0 ? 1 : -1,
        brake: tick % 240 > 180 ? 1 : 0,
      },
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

describe('stepGame — slopes (Phase 3)', () => {
  const inputs: InputMap = { a: THROTTLE, b: { ...THROTTLE, steer: 0.3 } };
  const race = (on: SimContext): GameState =>
    run(createGame(on.track, ['a', 'b']), inputs, 10 * 60, on);

  it('gives exactly the same race on a flat track whatever the slope settings', () => {
    const flat = race(ctx);
    expect(race({ ...ctx, slopeParams: { gravity: 9.81, factor: 1 } })).toEqual(flat);
  });

  it('gives exactly the same race on heights all at 0 as on the flat track', () => {
    const level = buildTrack({
      ...TEST_TRACK,
      points: TEST_TRACK.points.map((p) => ({ ...p, height: 0 })),
    });
    expect(level.elevated).toBe(true);
    expect(race({ ...ctx, track: level })).toEqual(race(ctx));
  });

  it('slows a car climbing a hill and speeds it down one', () => {
    const n = TEST_TRACK.points.length;
    // Up 15 m over the first quarter of the lap (where the grid is), then down again.
    const hilly = buildTrack({
      ...TEST_TRACK,
      points: TEST_TRACK.points.map((p, i) => ({
        ...p,
        height: 15 * Math.sin((2 * Math.PI * i) / n),
      })),
    });
    const speedAfter = (on: SimContext): number => {
      const car = findCar(run(createGame(on.track, ['a']), { a: THROTTLE }, 3 * 60, on), 'a')!;
      return Math.hypot(car.velocity.x, car.velocity.z);
    };
    const onHill = { ...ctx, track: hilly };
    expect(speedAfter({ ...onHill, slopeParams: { gravity: 9.81, factor: 1 } })).toBeLessThan(
      speedAfter({ ...onHill, slopeParams: { gravity: 9.81, factor: 0 } }),
    );
  });
});

describe('stepGame — damage', () => {
  const withDamage: SimContext = { ...ctx, damage: DAMAGE_PARAMS };
  const sample = track.samples[40]!;
  /** Car `p1` at the centreline of sample 40, heading for the right-hand wall at `speed`. */
  const towardsWall = (speed: number): GameState => {
    const game = createGame(track, ['p1']);
    const car = {
      ...game.cars[0]!,
      position: sample.position,
      heading: headingOf(sample.normal),
      velocity: scale(sample.normal, speed),
    };
    return { ...game, cars: [car] };
  };

  it('gives no car a damage field without SimContext.damage (every mode but the GP)', () => {
    const after = run(towardsWall(30), { p1: THROTTLE }, 120);
    expect(after.cars[0]!.damage).toBeUndefined();
  });

  it('damages the front wing in a wall hit and the tyres on the run-off, and keeps it on R', () => {
    const after = run(towardsWall(30), { p1: THROTTLE }, 120, withDamage);
    const damage = after.cars[0]!.damage!;
    expect(damage.frontWing).toBeGreaterThan(0.2);
    expect(Math.min(...damage.tyres)).toBeGreaterThan(0);
    const reset = stepGame(after, { p1: { ...NEUTRAL_INPUT, reset: true } }, withDamage);
    expect(reset.cars[0]!.damage).toEqual(damage);
  });

  it('keeps a car that drives clean undamaged', () => {
    const after = run(createGame(track, ['p1']), { p1: THROTTLE }, 60, withDamage);
    expect(after.cars[0]!.damage).toEqual({ frontWing: 0, rearWing: 0, tyres: [0, 0, 0, 0] });
  });

  it('makes a damaged car slower, and only with SimContext.damage', () => {
    const damaged = (game: GameState): GameState => ({
      ...game,
      cars: [{ ...game.cars[0]!, damage: { frontWing: 1, rearWing: 1, tyres: [1, 1, 1, 1] } }],
    });
    const speed = (game: GameState): number => {
      const { x, z } = game.cars[0]!.velocity;
      return Math.hypot(x, z);
    };
    const start = createGame(track, ['p1']);
    const clean = run(start, { p1: THROTTLE }, 240, withDamage);
    const slow = run(damaged(start), { p1: THROTTLE }, 240, withDamage);
    const ignored = run(damaged(start), { p1: THROTTLE }, 240);
    expect(speed(slow)).toBeLessThan(speed(clean) * 0.97);
    expect(speed(ignored)).toBeCloseTo(speed(clean));
  });

  it('repairCars takes every damage away (and leaves an undamaged state as it is)', () => {
    const crashed = run(towardsWall(30), { p1: THROTTLE }, 120, withDamage);
    expect(repairCars(crashed).cars[0]!.damage).toBeUndefined();
    const clean = createGame(track, ['p1']);
    expect(repairCars(clean)).toBe(clean);
  });
});

describe.each(GP_TRACKS.map((d) => [d.name, d] as const))(
  'stepGame — pit lane of %s',
  (_n, def) => {
    it('drives through the pit lane back onto the track, timed over the line, touching no wall', () => {
      const pits = buildTrack(def, { pitLane: true });
      const road = pits.routes.find((route) => route.pit)!;
      const { mainFrom, mainTo, from } = road.branch!;
      // 80 m of the track before the lane, the lane, 80 m of the track after it.
      const stretch = (start: number, sign: 1 | -1) =>
        pits.samples
          .map((s) => ({ s, d: (sign * (s.distance - start) + pits.length) % pits.length }))
          .filter(({ d }) => d > 0 && d < 80)
          .sort((a, b) => sign * (a.d - b.d))
          .map(({ s }) => s.position);
      const path = [
        ...stretch(mainFrom, -1),
        ...road.samples.filter((s) => s.distance >= from).map((s) => s.position),
        ...stretch(mainTo, 1),
      ];
      const pitCtx: SimContext = { ...ctx, track: pits };
      const heading = headingOf(sub(path[3]!, path[0]!));
      let state = createGame(pits, ['p1']);
      state = {
        ...state,
        cars: [
          { ...state.cars[0]!, position: path[0]!, heading, velocity: scale(forward(heading), 15) },
        ],
        laps: [createLapState('p1', locateOnTrack(pits, path[0]!).distance)],
      };
      let next = 0;
      let contacts = 0;
      for (let tick = 0; tick < 120 * 60 && next < path.length - 5; tick++) {
        const car = state.cars[0]!;
        while (next < path.length - 1 && distance(path[next]!, car.position) < 8) next++;
        const to = sub(path[next]!, car.position);
        const error = Math.atan2(dot(to, right(car.heading)), dot(to, forward(car.heading)));
        const speed = Math.hypot(car.velocity.x, car.velocity.z);
        const input = {
          ...NEUTRAL_INPUT,
          steer: Math.max(-1, Math.min(1, error * 2.5)),
          throttle: speed < 15 ? 1 : 0,
        };
        state = stepGame(state, { p1: input }, pitCtx);
        contacts += state.impacts.length;
      }
      expect(next).toBeGreaterThanOrEqual(path.length - 5);
      expect(contacts).toBe(0);
      // Every real pit lane crosses the start line: the lap starts there, timed as on the track.
      expect(state.laps[0]!.lapStartTick).not.toBeNull();
    });
  },
);
