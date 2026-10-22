import { CAR_COLLIDER, WALL_CATCH_DEPTH, type CollisionParams } from '../../config/collision';
import { wrapAngle } from '../../math/angle';
import { closestPointOnSegment } from '../../math/geometry';
import {
  add,
  dot,
  forward,
  headingOf,
  length,
  scale,
  sub,
  toWorld,
  ZERO,
  type Vec2,
} from '../../math/vec2';
import type { Track } from '../../track/types';
import type { CarState } from '../car';
import { applyHit } from './collider';
import type { ImpactEvent } from './types';

/** The part of a track the wall solver needs (tests can build a few walls by hand). */
export type WallSet = Pick<Track, 'walls' | 'wallGrid'>;

export interface WallContact {
  /** Closest point on the wall (m). */
  readonly point: Vec2;
  /** Unit push-out direction, towards the track. */
  readonly normal: Vec2;
  /** Penetration (m), > 0. */
  readonly depth: number;
}

/** Below this speed along the wall (m/s) the nose is not turned parallel to it. */
const MIN_ALIGN_SPEED = 3;
/** Hits more head-on than this (rad, ~70°) get no alignment: the car bounces back and you reverse. */
const MAX_ALIGN_ANGLE = 1.22;

/**
 * Deepest wall contact of a circle, if any. Walls are one-sided: a circle up to WALL_CATCH_DEPTH
 * behind a wall is still pushed back to the track side, so a fast car can't tunnel through.
 */
export function wallContact(walls: WallSet, center: Vec2, radius: number): WallContact | undefined {
  let best: WallContact | undefined;
  for (const index of walls.wallGrid.query(center, radius + WALL_CATCH_DEPTH)) {
    const wall = walls.walls[index]!;
    const { point } = closestPointOnSegment(center, wall.a, wall.b);
    const offset = sub(center, point);
    const signed = dot(offset, wall.normal);
    const span = sub(wall.b, wall.a);
    // Unclamped projection: 0..1 (ends included) = right in front of or behind the segment.
    const along = dot(sub(center, wall.a), span) / dot(span, span);
    let distance: number;
    let normal: Vec2;
    if (along >= 0 && along <= 1) {
      if (signed < -WALL_CATCH_DEPTH) continue;
      distance = signed;
      normal = wall.normal;
    } else {
      // Past the segment's end: push away from the polyline corner. Behind it, the neighbour handles it.
      if (signed < 0) continue;
      distance = length(offset);
      normal = distance > 0 ? scale(offset, 1 / distance) : wall.normal;
    }
    const depth = radius - distance;
    if (depth > 0 && (!best || depth > best.depth)) best = { point, normal, depth };
  }
  return best;
}

/** Pushes every circle of the car out of the walls and applies the wall response. */
export function resolveWalls(
  car: CarState,
  walls: WallSet,
  p: CollisionParams,
): { car: CarState; impact?: ImpactEvent } {
  let result = car;
  let impact: ImpactEvent | undefined;
  for (const ahead of CAR_COLLIDER.circles) {
    const center = toWorld(result.position, result.heading, ahead, 0);
    const contact = wallContact(walls, center, CAR_COLLIDER.radius);
    if (!contact) continue;
    result = { ...result, position: add(result.position, scale(contact.normal, contact.depth)) };
    const hit = wallHit(result, contact.normal, p);
    if (!hit) continue;
    result = hit.car;
    if (!impact || hit.strength > impact.strength) {
      impact = {
        carId: car.id,
        other: 'wall',
        point: contact.point,
        normal: contact.normal,
        strength: hit.strength,
      };
    }
  }
  return impact ? { car: result, impact } : { car: result };
}

/**
 * Wall response when the car moves into the wall: a small bounce on the normal, Coulomb friction
 * along the wall (a shallow scrape costs little, a head-on hit stops the car) and a spin that
 * turns the nose parallel to the wall, so the car keeps racing instead of sticking to it.
 */
function wallHit(
  car: CarState,
  normal: Vec2,
  p: CollisionParams,
): { car: CarState; strength: number } | undefined {
  const vn = dot(car.velocity, normal);
  if (vn >= 0) return undefined;
  const strength = -vn;
  const along = sub(car.velocity, scale(normal, vn));
  const alongSpeed = length(along);
  const friction = Math.min(alongSpeed, p.wallFriction * (1 + p.wallRestitution) * strength);
  const velocity = add(
    scale(normal, strength * p.wallRestitution),
    alongSpeed > 0 ? scale(along, 1 - friction / alongSpeed) : ZERO,
  );
  const spin = alignSpin(car, along, p);
  return { car: applyHit(car, velocity, spin, p.maxAlignSpin, strength, p), strength };
}

/** Spin that turns the nose parallel to the wall: `wallAlignSpin · (angle to the wall)`. */
function alignSpin(car: CarState, along: Vec2, p: CollisionParams): number {
  if (length(along) < MIN_ALIGN_SPEED || dot(forward(car.heading), along) <= 0) return 0;
  const error = wrapAngle(headingOf(along) - car.heading);
  return Math.abs(error) > MAX_ALIGN_ANGLE ? 0 : p.wallAlignSpin * error;
}
