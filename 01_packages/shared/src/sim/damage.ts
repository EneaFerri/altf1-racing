import type { CarParams } from '../config/car';
import type { DamageParams } from '../config/damage';
import { dot, forward, length, right, scale, sub } from '../math/vec2';
import type { Surface } from '../track/types';
import type { InputCommand } from '../types/input';
import type { CarState } from './car';
import type { ImpactEvent } from './collision/types';
import type { TyreState } from './tyres';

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

/**
 * The car a damaged car drives: `params` with less top speed, turning and grip, each by what its
 * parts cost (front wing, rear wing, the tyres' average) but never below its floor.
 */
export function damagedParams(params: CarParams, damage: CarDamage, p: DamageParams): CarParams {
  const tyres = average(damage.tyres);
  const share = (front: number, rear: number, tyre: number, floor: number): number =>
    Math.max(floor, 1 - damage.frontWing * front - damage.rearWing * rear - tyres * tyre);
  return {
    ...params,
    maxSpeed:
      params.maxSpeed *
      share(p.frontWingSpeedLoss, p.rearWingSpeedLoss, p.tyreSpeedLoss, p.minSpeed),
    maxYawRate:
      params.maxYawRate * share(p.frontWingTurnLoss, p.rearWingTurnLoss, p.tyreTurnLoss, p.minTurn),
    lateralGrip:
      params.lateralGrip *
      share(p.frontWingGripLoss, p.rearWingGripLoss, p.tyreGripLoss, p.minGrip),
  };
}

/**
 * `input` with the pull of uneven tyres: steering added towards the side whose tyres are more
 * damaged (right = +), within the steering range. Even tyres: `input` itself.
 */
export function damagedInput(
  input: InputCommand,
  damage: CarDamage,
  p: DamageParams,
): InputCommand {
  const [fl, fr, rl, rr] = damage.tyres;
  const pull = ((fr - fl + (rr - rl)) / 2) * p.tyrePull;
  if (pull === 0) return input;
  return { ...input, steer: Math.max(-1, Math.min(1, input.steer + pull)) };
}

/** Per wheel (order of CAR_WHEELS): whether that tyre is flat. */
export type Punctures = readonly [boolean, boolean, boolean, boolean];

export const NO_PUNCTURES: Punctures = [false, false, false, false];

/**
 * Which of a car's tyres are punctured: each one damaged to `punctureDamage` or more (red: hits, a
 * wall), and, once its set is worn to `punctureWear`, the most damaged one too (on a tie the first
 * in the order of CAR_WHEELS: the front left). Derived from the state alone, so the server and
 * the prediction agree without sending it. A pit stop (new tyres, repaired) mends it.
 */
export function puncturedTyres(
  damage: CarDamage | undefined,
  tyres: TyreState | undefined,
  p: DamageParams,
): Punctures {
  const wheels = (damage ?? NO_DAMAGE).tyres;
  const flat = wheels.map((tyre) => tyre >= p.punctureDamage);
  if (tyres && tyres.wear >= p.punctureWear) {
    const worst = wheels.reduce((best, tyre, i) => (tyre > wheels[best]! ? i : best), 0);
    flat[worst] = true;
  }
  return flat.some(Boolean) ? (flat as unknown as Punctures) : NO_PUNCTURES;
}

/** Whether any tyre in `punctures` is flat. */
export function isPunctured(punctures: Punctures): boolean {
  return punctures !== NO_PUNCTURES && punctures.some(Boolean);
}

/**
 * The car a punctured car drives: less grip and turning (its top speed: `limpSpeed`).
 * No flat tyre: `params` itself.
 */
export function puncturedParams(
  params: CarParams,
  punctures: Punctures,
  p: DamageParams,
): CarParams {
  if (!isPunctured(punctures)) return params;
  return {
    ...params,
    lateralGrip: params.lateralGrip * p.punctureGrip,
    maxYawRate: params.maxYawRate * p.punctureTurn,
  };
}

/** `input` with a flat tyre's pull towards its side (right = +), within the steering range. */
export function puncturedInput(
  input: InputCommand,
  punctures: Punctures,
  p: DamageParams,
): InputCommand {
  if (!isPunctured(punctures)) return input;
  const [fl, fr, rl, rr] = punctures.map(Number) as [number, number, number, number];
  const pull = (fr + rr - fl - rl) * p.puncturePull;
  if (pull === 0) return input;
  return { ...input, steer: Math.max(-1, Math.min(1, input.steer + pull)) };
}

/**
 * `car` after moving on a flat tyre: faster than `punctureTopSpeed`, it loses `punctureDecel`
 * m/s² until it is down to it. No flat tyre: `car` itself.
 */
export function limpSpeed(
  car: CarState,
  punctures: Punctures,
  dt: number,
  p: DamageParams,
): CarState {
  if (!isPunctured(punctures)) return car;
  const speed = length(car.velocity);
  if (speed <= p.punctureTopSpeed) return car;
  const slowed = Math.max(p.punctureTopSpeed, speed - p.punctureDecel * dt);
  return { ...car, velocity: scale(car.velocity, slowed / speed) };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Every part limited to 1: the ceiling (the car's effects keep a floor, see `damagedParams`). */
function capped(damage: CarDamage): CarDamage {
  const cap = (value: number): number => Math.min(1, value);
  const [fl, fr, rl, rr] = damage.tyres;
  return {
    frontWing: cap(damage.frontWing),
    rearWing: cap(damage.rearWing),
    tyres: [cap(fl), cap(fr), cap(rl), cap(rr)],
  };
}
