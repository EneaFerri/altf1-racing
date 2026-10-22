import { describe, expect, it } from 'vitest';
import { CAR_COLLIDER, COLLISION_PARAMS } from '../../config/collision';
import { vec2 } from '../../math/vec2';
import { createCar } from '../car';
import { applyHit, carCircles, kickSpin } from './collider';

describe('carCircles', () => {
  it('lines the circles up along the heading, front first', () => {
    const circles = carCircles(createCar({ position: vec2(10, 0), heading: 0 }));
    expect(circles).toHaveLength(CAR_COLLIDER.circles.length);
    expect(circles[0]!.x).toBeCloseTo(10);
    expect(circles[0]!.z).toBeCloseTo(-CAR_COLLIDER.circles[0]!); // forward is -Z
    expect(circles[2]!.z).toBeGreaterThan(0);
  });
});

describe('kickSpin', () => {
  it('does not stack kicks in the same direction', () => {
    expect(kickSpin(0.8, 0.5, 1.2)).toBe(0.8);
    expect(kickSpin(0.5, 0.8, 1.2)).toBe(0.8);
  });

  it('adds an opposite kick and clamps to ±max', () => {
    expect(kickSpin(0.8, -0.5, 1.2)).toBeCloseTo(0.3);
    expect(kickSpin(0, 5, 1.2)).toBe(1.2);
    expect(kickSpin(0, -5, 1.2)).toBe(-1.2);
  });

  it('keeps a spin already above max (e.g. from a high kerb)', () => {
    expect(kickSpin(2, 0.5, 1.2)).toBe(2);
  });
});

describe('applyHit', () => {
  const drifting = { ...createCar(), drifting: true, driftDirection: 1, gripRecovery: 0 };
  const limit = COLLISION_PARAMS.driftBreakImpactSpeed;

  it('changes only velocity and spin on a soft hit', () => {
    const out = applyHit(drifting, vec2(1, 2), 0.3, 1.2, limit - 1, COLLISION_PARAMS);
    expect(out).toEqual({ ...drifting, velocity: vec2(1, 2), spin: 0.3 });
  });

  it('ends a drift on a hard hit', () => {
    const out = applyHit(drifting, vec2(1, 2), 0, 1.2, limit + 1, COLLISION_PARAMS);
    expect(out.drifting).toBe(false);
    expect(out.driftDirection).toBe(0);
    expect(out.gripRecovery).toBe(0);
  });
});
