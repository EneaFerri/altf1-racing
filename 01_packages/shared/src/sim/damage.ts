import type { DamageParams } from '../config/damage';
import { dot, forward, length, right, sub } from '../math/vec2';
import type { Surface } from '../track/types';
import type { CarState } from './car';
import type { ImpactEvent } from './collision/types';

/**
 * How damaged a car's parts are, each from 0 (as new) to 1 (fully damaged). Only cars in a race
 * with damage (Grand Prix, `SimContext.damage`) have it. See 01_docs/damage.md.
 */
export interface CarDamage {
  readonly frontWing: number;
  readonly rearWing: number;
  /** One per wheel, in the order of CAR_WHEELS: front left, front right, rear left, rear right. */
  readonly tyres: readonly [number, number, number, number];
}

export const NO_DAMAGE: CarDamage = { frontWing: 0, rearWing: 0, tyres: [0, 0, 0, 0] };

/** Where a hit landed on the car. */
export type HitZone = 'front' | 'rear' | 'left' | 'right';

/** The zone of `car` a contact at `point` hits: by how far ahead of its centre it is, else its side. */
export function hitZone(car: CarState, point: ImpactEvent['point'], p: DamageParams): HitZone {
  const offset = sub(point, car.position);
  const ahead = dot(offset, forward(car.heading));
  if (ahead > p.frontZone) return 'front';
  if (ahead < -p.rearZone) return 'rear';
  return dot(offset, right(car.heading)) < 0 ? 'left' : 'right';
}

/**
 * `damage` after the car took `impact` (a car or a wall): above the threshold, the part hit and its
 * tyres get damage growing with the closing speed. Front: front wing + front tyres; rear: rear
 * wing + rear tyres; a side: that side's two tyres.
 */
export function impactDamage(
  damage: CarDamage,
  car: CarState,
  impact: ImpactEvent,
  p: DamageParams,
): CarDamage {
  const amount = Math.max(0, impact.strength - p.impactThreshold) * p.impactDamage;
  if (amount === 0) return damage;
  const [fl, fr, rl, rr] = damage.tyres;
  const end = amount * p.endTyreShare;
  const side = amount * p.sideTyreShare;
  switch (hitZone(car, impact.point, p)) {
    case 'front':
      return capped({
        ...damage,
        frontWing: damage.frontWing + amount,
        tyres: [fl + end, fr + end, rl, rr],
      });
    case 'rear':
      return capped({
        ...damage,
        rearWing: damage.rearWing + amount,
        tyres: [fl, fr, rl + end, rr + end],
      });
    case 'left':
      return capped({ ...damage, tyres: [fl + side, fr, rl + side, rr] });
    case 'right':
      return capped({ ...damage, tyres: [fl, fr + side, rl, rr + side] });
  }
}

/**
 * `damage` after `dt` seconds with the wheels on `wheelSurfaces`: each wheel on grass or gravel
 * wears its tyre, fully from `offTrackSpeed` on, less when slower, none at rest.
 */
export function offTrackDamage(
  damage: CarDamage,
  wheelSurfaces: readonly Surface[],
  speed: number,
  dt: number,
  p: DamageParams,
): CarDamage {
  const pace = Math.min(1, speed / p.offTrackSpeed) * dt;
  if (pace === 0) return damage;
  const rate = (surface: Surface | undefined): number =>
    surface === 'grass' ? p.grassDamage : surface === 'gravel' ? p.gravelDamage : 0;
  const [fl, fr, rl, rr] = damage.tyres;
  const tyres = [
    fl + rate(wheelSurfaces[0]) * pace,
    fr + rate(wheelSurfaces[1]) * pace,
    rl + rate(wheelSurfaces[2]) * pace,
    rr + rate(wheelSurfaces[3]) * pace,
  ] as const;
  if (tyres.every((tyre, i) => tyre === damage.tyres[i])) return damage;
  return capped({ ...damage, tyres });
}

/** `car`'s damage after one tick: its own impacts of the tick, then the surfaces under its wheels. */
export function stepDamage(
  car: CarState,
  impacts: readonly ImpactEvent[],
  dt: number,
  p: DamageParams,
): CarDamage {
  let damage = car.damage ?? NO_DAMAGE;
  for (const impact of impacts) {
    if (impact.carId === car.id) damage = impactDamage(damage, car, impact, p);
  }
  return offTrackDamage(damage, car.wheelSurfaces, length(car.velocity), dt, p);
}

/** Every part limited to 1: the ceiling (the car's effects keep a floor, see 4b). */
function capped(damage: CarDamage): CarDamage {
  const cap = (value: number): number => Math.min(1, value);
  const [fl, fr, rl, rr] = damage.tyres;
  return {
    frontWing: cap(damage.frontWing),
    rearWing: cap(damage.rearWing),
    tyres: [cap(fl), cap(fr), cap(rl), cap(rr)],
  };
}
