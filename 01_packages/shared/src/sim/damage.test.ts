import { describe, expect, it } from 'vitest';
import { DAMAGE_PARAMS as P } from '../config/damage';
import { toWorld, type Vec2 } from '../math/vec2';
import { createCar } from './car';
import type { ImpactEvent } from './collision/types';
import {
  hitZone,
  impactDamage,
  NO_DAMAGE,
  offTrackDamage,
  stepDamage,
  type CarDamage,
} from './damage';

// Points are given in the car's own frame (`at`), so its heading doesn't matter.
const car = createCar({ id: 'p1', position: { x: 10, z: 20 }, heading: 0.7 });
const at = (ahead: number, side: number): Vec2 => toWorld(car.position, car.heading, ahead, side);
const hit = (point: Vec2, strength: number, other: ImpactEvent['other'] = 'wall'): ImpactEvent => ({
  carId: 'p1',
  other,
  point,
  normal: { x: 0, z: 1 },
  strength,
});
/** Damage per m/s above the threshold, for readable expectations. */
const per = (strength: number): number => (strength - P.impactThreshold) * P.impactDamage;

describe('hitZone', () => {
  it('tells front, rear and the sides apart by the contact point in the car frame', () => {
    expect(hitZone(car, at(2.5, 0.3), P)).toBe('front');
    expect(hitZone(car, at(-2.2, -0.3), P)).toBe('rear');
    expect(hitZone(car, at(0.4, -1.2), P)).toBe('left');
    expect(hitZone(car, at(-0.5, 1.2), P)).toBe('right');
  });
});

describe('impactDamage', () => {
  it('does nothing below the threshold (leaning, scraping)', () => {
    expect(impactDamage(NO_DAMAGE, car, hit(at(2.5, 0), P.impactThreshold), P)).toBe(NO_DAMAGE);
  });

  it('a front hit damages the front wing and, less, the front tyres', () => {
    const d = impactDamage(NO_DAMAGE, car, hit(at(2.5, 0), 20), P);
    expect(d.frontWing).toBeCloseTo(per(20));
    expect(d.rearWing).toBe(0);
    expect(d.tyres[0]).toBeCloseTo(per(20) * P.endTyreShare);
    expect(d.tyres[1]).toBeCloseTo(per(20) * P.endTyreShare);
    expect(d.tyres.slice(2)).toEqual([0, 0]);
  });

  it('a rear hit damages the rear wing and the rear tyres', () => {
    const d = impactDamage(NO_DAMAGE, car, hit(at(-2.3, 0), 14, 'p2'), P);
    expect(d.rearWing).toBeCloseTo(per(14));
    expect(d.frontWing).toBe(0);
    expect(d.tyres.slice(0, 2)).toEqual([0, 0]);
    expect(d.tyres[3]).toBeCloseTo(per(14) * P.endTyreShare);
  });

  it("a side hit damages only that side's tyres", () => {
    const left = impactDamage(NO_DAMAGE, car, hit(at(0, -1.2), 12), P);
    expect([left.frontWing, left.rearWing]).toEqual([0, 0]);
    expect(left.tyres[0]).toBeCloseTo(per(12) * P.sideTyreShare);
    expect(left.tyres[2]).toBeCloseTo(per(12) * P.sideTyreShare);
    expect([left.tyres[1], left.tyres[3]]).toEqual([0, 0]);
    const right = impactDamage(NO_DAMAGE, car, hit(at(0, 1.2), 12), P);
    expect([right.tyres[0], right.tyres[2]]).toEqual([0, 0]);
    expect(right.tyres[1]).toBeGreaterThan(0);
  });

  it('adds up over hits and never goes beyond 1', () => {
    let d: CarDamage = NO_DAMAGE;
    for (let i = 0; i < 5; i++) d = impactDamage(d, car, hit(at(2.5, 0), 60), P);
    expect(d.frontWing).toBe(1);
    expect(Math.max(...d.tyres)).toBeLessThanOrEqual(1);
  });
});

describe('offTrackDamage', () => {
  it('wears the tyres of the wheels on grass or gravel, gravel faster', () => {
    const d = offTrackDamage(
      NO_DAMAGE,
      ['grass', 'asphalt', 'gravel', 'kerb'],
      P.offTrackSpeed,
      1,
      P,
    );
    expect(d.tyres[0]).toBeCloseTo(P.grassDamage);
    expect(d.tyres[2]).toBeCloseTo(P.gravelDamage);
    expect([d.tyres[1], d.tyres[3], d.frontWing, d.rearWing]).toEqual([0, 0, 0, 0]);
  });

  it('is full from offTrackSpeed on, less when slower, none at rest', () => {
    const grass = ['grass', 'grass', 'grass', 'grass'] as const;
    const fast = offTrackDamage(NO_DAMAGE, grass, 2 * P.offTrackSpeed, 1, P);
    const half = offTrackDamage(NO_DAMAGE, grass, P.offTrackSpeed / 2, 1, P);
    expect(fast.tyres[0]).toBeCloseTo(P.grassDamage);
    expect(half.tyres[0]).toBeCloseTo(P.grassDamage / 2);
    expect(offTrackDamage(NO_DAMAGE, grass, 0, 1, P)).toBe(NO_DAMAGE);
  });

  it('leaves the damage untouched on asphalt and kerbs', () => {
    const d: CarDamage = { frontWing: 0.2, rearWing: 0, tyres: [0.1, 0, 0, 0] };
    expect(offTrackDamage(d, ['asphalt', 'kerb', 'highKerb', 'asphalt'], 50, 1, P)).toBe(d);
  });
});

describe('stepDamage', () => {
  it("starts from no damage and takes only the car's own impacts", () => {
    const mine = hit(at(2.5, 0), 20);
    const theirs = { ...hit(at(2.5, 0), 40), carId: 'p2' };
    const d = stepDamage(car, [mine, theirs], 1 / 60, P);
    expect(d.frontWing).toBeCloseTo(per(20));
  });

  it('carries on from the damage the car already has', () => {
    const damaged = {
      ...car,
      damage: { frontWing: 0.5, rearWing: 0.1, tyres: [0, 0, 0, 0] as const },
    };
    expect(stepDamage(damaged, [], 1 / 60, P)).toBe(damaged.damage);
  });
});
