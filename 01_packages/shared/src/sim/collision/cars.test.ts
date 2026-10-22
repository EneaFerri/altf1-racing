import { describe, expect, it } from 'vitest';
import { CAR_COLLIDER, COLLISION_PARAMS } from '../../config/collision';
import { add, distance, forward, right, scale, vec2 } from '../../math/vec2';
import { createCar, type CarState } from '../car';
import { carCircles } from './collider';
import { carContact, resolveCarPair } from './cars';

function carAt(id: string, x: number, z: number, heading: number, velocity = vec2(0, 0)): CarState {
  return { ...createCar({ id, position: vec2(x, z), heading }), velocity };
}

/** Smallest gap between any two circles of the cars (negative = overlap). */
function clearance(a: CarState, b: CarState): number {
  let min = Infinity;
  for (const ca of carCircles(a)) {
    for (const cb of carCircles(b)) min = Math.min(min, distance(ca, cb) - 2 * CAR_COLLIDER.radius);
  }
  return min;
}

describe('carContact', () => {
  it('is undefined for cars apart, and points from a to b when touching', () => {
    expect(carContact(carAt('a', 0, 0, 0), carAt('b', 5, 0, 0))).toBeUndefined();
    const contact = carContact(carAt('a', 0, 0, 0), carAt('b', 2, 0, 0))!;
    expect(contact.depth).toBeCloseTo(0.2);
    expect(contact.normal.x).toBeCloseTo(1);
  });
});

describe('resolveCarPair', () => {
  it('rear-end: conserves momentum, pushes the car in front, leaves no overlap', () => {
    const behind = carAt('a', 0, 0, 0, scale(forward(0), 50));
    const front = carAt('b', 0, -5, 0, scale(forward(0), 40));
    const { a, b, impacts } = resolveCarPair(behind, front, COLLISION_PARAMS);
    const momentum = add(a.velocity, b.velocity);
    expect(momentum.x).toBeCloseTo(0);
    expect(momentum.z).toBeCloseTo(-90);
    expect(-b.velocity.z).toBeGreaterThan(40);
    expect(-a.velocity.z).toBeLessThan(50);
    expect(clearance(a, b)).toBeGreaterThan(-1e-9);
    expect(impacts.map((i) => i.carId)).toEqual(['a', 'b']);
    expect(impacts[0]!.strength).toBeCloseTo(10);
  });

  it('a straight rear-end gives no spin, an off-centre one gives a bounded nudge', () => {
    const straight = resolveCarPair(
      carAt('a', 0, 0, 0, scale(forward(0), 50)),
      carAt('b', 0, -5, 0, vec2(0, 0)),
      COLLISION_PARAMS,
    );
    expect(straight.b.spin).toBe(0);
    // Hit from the right on the rear of b: its tail goes left, so the nose turns right (spin < 0).
    const side = resolveCarPair(
      carAt('a', 2, 1.3, 0, scale(right(0), -20)),
      carAt('b', 0, 0, 0, vec2(0, 0)),
      COLLISION_PARAMS,
    );
    expect(side.b.spin).toBeLessThan(0);
    expect(Math.abs(side.b.spin)).toBeLessThanOrEqual(COLLISION_PARAMS.maxImpactSpin);
  });

  it('leaning on another car never rotates it', () => {
    const { b } = resolveCarPair(
      carAt('a', 2.1, 1.3, 0, vec2(-1, -50)),
      carAt('b', 0, 0, 0, vec2(0, -50)),
      COLLISION_PARAMS,
    );
    expect(b.spin).toBe(0);
  });

  it('only separates cars that are already moving apart', () => {
    const a = carAt('a', 0, 0, 0, vec2(-3, 0));
    const b = carAt('b', 2, 0, 0, vec2(3, 0));
    const out = resolveCarPair(a, b, COLLISION_PARAMS);
    expect(out.impacts).toEqual([]);
    expect(out.a.velocity).toEqual(a.velocity);
    expect(clearance(out.a, out.b)).toBeGreaterThan(-1e-9);
  });
});
