import { CAR_COLLIDER, type CollisionParams } from '../../config/collision';
import { toWorld, type Vec2 } from '../../math/vec2';
import type { CarState } from '../car';

/** World centres of the car's collision circles (front to rear), all of radius CAR_COLLIDER.radius. */
export function carCircles(car: CarState): Vec2[] {
  return CAR_COLLIDER.circles.map((ahead) => toWorld(car.position, car.heading, ahead, 0));
}

/**
 * Applies the result of a hit to a car: the new velocity, a spin kick (see `kickSpin`) and, for a
 * hard hit, the end of a drift. Nothing else changes, so the handling is untouched next tick.
 */
export function applyHit(
  car: CarState,
  velocity: Vec2,
  spinKick: number,
  maxSpin: number,
  strength: number,
  p: CollisionParams,
): CarState {
  const endsDrift = car.drifting && strength > p.driftBreakImpactSpeed;
  return {
    ...car,
    velocity,
    spin: kickSpin(car.spin, spinKick, maxSpin),
    // gripRecovery 0 = the usual drift exit: the car slides out and straightens without losing speed.
    ...(endsDrift ? { drifting: false, driftDirection: 0, gripRecovery: 0 } : {}),
  };
}

/**
 * Spin after a kick, limited to ±max. Kicks don't stack: one in the same direction as the current
 * spin only raises it to the kick's size, so repeated contacts can't wind a car up into a spin-out.
 * A kick the other way adds (it slows the rotation). Spin already beyond max (a kerb) is kept.
 */
export function kickSpin(spin: number, kick: number, max: number): number {
  const bounded = Math.min(max, Math.max(-max, kick));
  if (Math.sign(bounded) === Math.sign(spin)) {
    return Math.abs(bounded) > Math.abs(spin) ? bounded : spin;
  }
  const limit = Math.max(max, Math.abs(spin));
  return Math.min(limit, Math.max(-limit, spin + bounded));
}
