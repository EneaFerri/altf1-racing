import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../../config/car';
import { CAR_COLLIDER, COLLISION_PARAMS } from '../../config/collision';
import { FIXED_DT, TICK_RATE } from '../../config/sim';
import { SegmentGrid } from '../../math/SegmentGrid';
import { forward, length, scale, vec2 } from '../../math/vec2';
import type { WallSegment } from '../../track/types';
import { NEUTRAL_INPUT, type InputCommand } from '../../types/input';
import { createCar, stepCar, type CarState } from '../car';
import { carCircles } from './collider';
import { resolveWalls, wallContact, type WallSet } from './walls';

// A long straight wall on x = 0, facing +x (the track side). Heading 0 drives along it (-Z);
// a positive heading points the nose into the wall.
const segments: WallSegment[] = [];
for (let z = -3000; z < 3000; z += 2) {
  segments.push({ a: vec2(0, z), b: vec2(0, z + 2), normal: vec2(1, 0) });
}
const WALL: WallSet = {
  walls: segments,
  wallGrid: new SegmentGrid(segments.map((w) => [w.a, w.b] as const)),
};

const THROTTLE: InputCommand = { ...NEUTRAL_INPUT, throttle: 1 };
const deg = (d: number): number => (d * Math.PI) / 180;

function carAt(x: number, heading: number, speed: number, extra: Partial<CarState> = {}): CarState {
  return {
    ...createCar({ position: vec2(x, 0), heading }),
    velocity: scale(forward(heading), speed),
    ...extra,
  };
}

/** Steps car + walls; reports speed before the first contact and the car's state over time. */
function drive(car: CarState, input: InputCommand, seconds: number) {
  let speedBefore = 0;
  let minSpeed = Infinity;
  let hitTick = -1;
  let minClearance = Infinity;
  const after: CarState[] = [];
  for (let tick = 0; tick < seconds * TICK_RATE; tick++) {
    const speed = length(car.velocity);
    const result = resolveWalls(stepCar(car, input, CAR_PARAMS, FIXED_DT), WALL, COLLISION_PARAMS);
    car = result.car;
    if (result.impact && hitTick < 0) {
      hitTick = tick;
      speedBefore = speed;
    }
    if (hitTick >= 0) {
      minSpeed = Math.min(minSpeed, length(car.velocity));
      after.push(car);
    }
    for (const c of carCircles(car)) minClearance = Math.min(minClearance, c.x);
  }
  return { car, speedBefore, minKept: minSpeed / speedBefore, after, minClearance };
}

describe('wallContact', () => {
  it('finds penetration on the track side, none when clear', () => {
    expect(wallContact(WALL, vec2(0.5, 0), 1.1)?.depth).toBeCloseTo(0.6);
    expect(wallContact(WALL, vec2(0.5, 0), 1.1)?.normal).toEqual(vec2(1, 0));
    expect(wallContact(WALL, vec2(1.2, 0), 1.1)).toBeUndefined();
  });

  it('catches a circle that tunnelled just behind the wall', () => {
    expect(wallContact(WALL, vec2(-1.5, 0), 1.1)?.depth).toBeCloseTo(2.6);
  });

  it('ignores whatever is far behind a wall (another part of the track)', () => {
    expect(wallContact(WALL, vec2(-5, 0), 1.1)).toBeUndefined();
  });
});

describe('resolveWalls', () => {
  it('only separates a car that is already moving away from the wall', () => {
    const car = carAt(0.8, deg(-30), 30);
    const { car: out, impact } = resolveWalls(car, WALL, COLLISION_PARAMS);
    expect(impact).toBeUndefined();
    expect(out.velocity).toEqual(car.velocity);
    for (const c of carCircles(out)) expect(c.x).toBeGreaterThanOrEqual(CAR_COLLIDER.radius - 1e-9);
  });

  it('a glancing 10° hit at 200 km/h keeps ≥ 90% speed and lines the car up within 0.5 s', () => {
    const { minKept, after } = drive(carAt(3, deg(10), 200 / 3.6), THROTTLE, 2);
    expect(minKept).toBeGreaterThan(0.9);
    expect(Math.abs(after[30]!.heading)).toBeLessThan(deg(5));
  });

  it('costs more the steeper the hit: 30° keeps ≥ 65%, 45° keeps ≥ 40%', () => {
    expect(drive(carAt(3, deg(30), 200 / 3.6), THROTTLE, 2).minKept).toBeGreaterThan(0.65);
    const steep = drive(carAt(3, deg(45), 200 / 3.6), THROTTLE, 2);
    expect(steep.minKept).toBeGreaterThan(0.4);
    expect(steep.minKept).toBeLessThan(0.65);
  });

  it('a head-on hit stops the car with a small bounce, and reversing gets it out', () => {
    const { car, after } = drive(carAt(3, deg(90), 100 / 3.6), NEUTRAL_INPUT, 1);
    expect(Math.max(...after.map((c) => c.velocity.x))).toBeLessThan(3);
    const reversed = drive(car, { ...NEUTRAL_INPUT, brake: 1 }, 1.5).car;
    expect(reversed.position.x - car.position.x).toBeGreaterThan(2);
  });

  it('never lets a car end up behind the wall, at any angle, at top speed', () => {
    for (const angle of [2, 10, 30, 60, 90]) {
      const { minClearance } = drive(carAt(4, deg(angle), 70), { ...THROTTLE, steer: -1 }, 3);
      expect(minClearance).toBeGreaterThan(0);
    }
  });

  it('a gentle scrape keeps the drift, a hard hit ends it like a normal drift exit', () => {
    const drifting = { drifting: true, driftDirection: 1, gripRecovery: 0 };
    const gentle = carAt(1.15, deg(4), 40, drifting);
    expect(resolveWalls(gentle, WALL, COLLISION_PARAMS).car.drifting).toBe(true);
    const hard = carAt(1.15, deg(25), 40, drifting);
    const out = resolveWalls(hard, WALL, COLLISION_PARAMS).car;
    expect(out.drifting).toBe(false);
    expect(out.gripRecovery).toBe(0);
  });
});
