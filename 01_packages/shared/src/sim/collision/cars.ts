import { CAR_COLLIDER, type CollisionParams } from '../../config/collision';
import { add, cross, distance, dot, length, scale, sub, type Vec2 } from '../../math/vec2';
import type { CarState } from '../car';
import { applyHit, carCircles } from './collider';
import type { ImpactEvent } from './types';

export interface CarContact {
  /** Middle of the overlap (m). */
  readonly point: Vec2;
  /** Unit vector from car `a` towards car `b`. */
  readonly normal: Vec2;
  /** Overlap (m), > 0. */
  readonly depth: number;
}

/** Cars whose centres are farther apart than this can't touch (two collider lengths). */
const BROAD_PHASE = 2 * (Math.max(...CAR_COLLIDER.circles.map(Math.abs)) + CAR_COLLIDER.radius);

/** Deepest overlap between the circles of two cars, if they touch. */
export function carContact(a: CarState, b: CarState): CarContact | undefined {
  if (distance(a.position, b.position) > BROAD_PHASE) return undefined;
  const r = CAR_COLLIDER.radius;
  let best: CarContact | undefined;
  for (const ca of carCircles(a)) {
    for (const cb of carCircles(b)) {
      const gap = distance(ca, cb);
      const depth = 2 * r - gap;
      if (depth <= 0 || (best && depth <= best.depth)) continue;
      // Exactly coincident circles: separate along the line between the car centres.
      const normal = gap > 0 ? scale(sub(cb, ca), 1 / gap) : fallbackNormal(a, b);
      best = { point: add(ca, scale(normal, r - depth / 2)), normal, depth };
    }
  }
  return best;
}

/**
 * Separates two touching cars (equal mass, half the overlap each) and, if they are closing in,
 * exchanges a normal impulse with `carRestitution`, a small friction (rubbing slides) and the
 * spin an off-centre hit gives each car, bounded by `maxImpactSpin`.
 */
export function resolveCarPair(
  a: CarState,
  b: CarState,
  p: CollisionParams,
): { a: CarState; b: CarState; impacts: ImpactEvent[] } {
  const contact = carContact(a, b);
  if (!contact) return { a, b, impacts: [] };
  const { point, normal, depth } = contact;
  const push = scale(normal, depth / 2);
  let nextA: CarState = { ...a, position: sub(a.position, push) };
  let nextB: CarState = { ...b, position: add(b.position, push) };

  const relative = sub(b.velocity, a.velocity);
  const vn = dot(relative, normal);
  if (vn >= 0) return { a: nextA, b: nextB, impacts: [] };

  const strength = -vn;
  // Velocity change of each car along the normal (equal masses share the impulse).
  const j = ((1 + p.carRestitution) * strength) / 2;
  const sliding = sub(relative, scale(normal, vn));
  const slideSpeed = length(sliding);
  const friction = slideSpeed > 0 ? Math.min(slideSpeed / 2, p.carFriction * j) / slideSpeed : 0;
  // Impulse (per unit mass) on b; a gets the opposite.
  const impulse = sub(scale(normal, j), scale(sliding, friction));

  nextA = applyHit(
    nextA,
    sub(nextA.velocity, impulse),
    spinFrom(nextA, point, scale(impulse, -1), strength, p),
    p.maxImpactSpin,
  );
  nextB = applyHit(
    nextB,
    add(nextB.velocity, impulse),
    spinFrom(nextB, point, impulse, strength, p),
    p.maxImpactSpin,
  );

  return {
    a: nextA,
    b: nextB,
    impacts: [
      { carId: a.id, other: b.id, point, normal: scale(normal, -1), strength },
      { carId: b.id, other: a.id, point, normal, strength },
    ],
  };
}

/**
 * Heading-rate change (rad/s) from an impulse at `point`. A push to the right ahead of the centre
 * turns the nose right (heading decreases), hence the minus sign. Faded out for gentle contacts.
 */
function spinFrom(
  car: CarState,
  point: Vec2,
  impulse: Vec2,
  strength: number,
  p: CollisionParams,
): number {
  const min = p.carSpinMinImpact;
  const fade = min > 0 ? Math.min(1, Math.max(0, (strength - min) / min)) : 1;
  return (-cross(sub(point, car.position), impulse) / CAR_COLLIDER.inertia) * p.carSpinScale * fade;
}

function fallbackNormal(a: CarState, b: CarState): Vec2 {
  const between = sub(b.position, a.position);
  const gap = length(between);
  return gap > 0 ? scale(between, 1 / gap) : { x: 1, z: 0 };
}
