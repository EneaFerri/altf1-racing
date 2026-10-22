import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../../config/car';
import { CAR_COLLIDER, COLLISION_PARAMS } from '../../config/collision';
import { FIXED_DT, TICK_RATE } from '../../config/sim';
import { SegmentGrid } from '../../math/SegmentGrid';
import { dot, forward, scale, vec2 } from '../../math/vec2';
import type { WallSegment } from '../../track/types';
import { NEUTRAL_INPUT, type InputCommand } from '../../types/input';
import { createCar, stepCar, type CarState } from '../car';
import { carCircles } from './collider';
import { resolveCollisions } from './resolve';
import type { WallSet } from './walls';

const NO_WALLS: WallSet = { walls: [], wallGrid: new SegmentGrid([]) };
const THROTTLE: InputCommand = { ...NEUTRAL_INPUT, throttle: 1 };

function carAt(id: string, x: number, z: number, heading: number, speed: number): CarState {
  return {
    ...createCar({ id, position: vec2(x, z), heading }),
    velocity: scale(forward(heading), speed),
  };
}

/** Both cars at full throttle, no steering, for `seconds`. */
function race(
  cars: CarState[],
  walls: WallSet,
  seconds: number,
  onTick?: (cars: CarState[]) => void,
) {
  let impacts = 0;
  for (let tick = 0; tick < seconds * TICK_RATE; tick++) {
    const moved = cars.map((car) => stepCar(car, THROTTLE, CAR_PARAMS, FIXED_DT));
    const result = resolveCollisions(moved, walls, COLLISION_PARAMS);
    cars = result.cars;
    impacts += result.impacts.length;
    onTick?.(cars);
  }
  return { cars, impacts };
}

describe('resolveCollisions', () => {
  it('a dive-bomb into the rear: bounded rotation for both, even tangled with no steering', () => {
    const a0 = carAt('a', -5, 4, -0.4, 45);
    const b0 = carAt('b', 0, 0, 0, 35);
    let maxTurn = 0;
    let maxSpin = 0;
    const { impacts } = race([a0, b0], NO_WALLS, 1.5, ([a, b]) => {
      maxTurn = Math.max(
        maxTurn,
        Math.abs(a!.heading - a0.heading),
        Math.abs(b!.heading - b0.heading),
      );
      maxSpin = Math.max(maxSpin, Math.abs(a!.spin), Math.abs(b!.spin));
    });
    expect(impacts).toBeGreaterThan(0);
    expect(maxSpin).toBeLessThanOrEqual(COLLISION_PARAMS.maxImpactSpin);
    expect(maxTurn).toBeLessThan((30 * Math.PI) / 180);
  });

  it('side-by-side rubbing for 1 s costs both cars less than 5% of their speed', () => {
    const solo = race([carAt('b', 0, 0, 0, 50)], NO_WALLS, 1).cars[0]!;
    const { cars, impacts } = race(
      [carAt('a', 0, 0, 0, 50), { ...carAt('b', 2.15, 0, 0, 50), velocity: vec2(-1, -50) }],
      NO_WALLS,
      1,
    );
    expect(impacts).toBeGreaterThan(0);
    for (const car of cars) {
      expect(dot(car.velocity, forward(car.heading))).toBeGreaterThan(
        0.95 * dot(solo.velocity, forward(solo.heading)),
      );
    }
  });

  it('a car squeezed between another car and a wall never goes into the wall', () => {
    const segments: WallSegment[] = [];
    for (let z = -200; z < 200; z += 2) {
      segments.push({ a: vec2(0, z), b: vec2(0, z + 2), normal: vec2(1, 0) });
    }
    const wall: WallSet = {
      walls: segments,
      wallGrid: new SegmentGrid(segments.map((w) => [w.a, w.b] as const)),
    };
    const squeezed = carAt('a', 1.2, 0, 0, 30);
    const pusher = { ...carAt('b', 3.3, 0, 0.3, 30), velocity: vec2(-8, -30) };
    const { cars } = resolveCollisions([squeezed, pusher], wall, COLLISION_PARAMS);
    for (const c of carCircles(cars[0]!)) {
      expect(c.x).toBeGreaterThanOrEqual(CAR_COLLIDER.radius - 1e-9);
    }
  });

  it('reports one impact per car and per thing it hit, the strongest', () => {
    const { impacts } = resolveCollisions(
      [carAt('a', 0, 0, 0, 50), carAt('b', 0, -5, 0, 40)],
      NO_WALLS,
      COLLISION_PARAMS,
    );
    expect(impacts.map((i) => `${i.carId}>${i.other}`)).toEqual(['a>b', 'b>a']);
  });

  it('is deterministic', () => {
    const run = () => race([carAt('a', -5, 4, -0.4, 45), carAt('b', 0, 0, 0, 35)], NO_WALLS, 2);
    expect(run()).toEqual(run());
  });
});
