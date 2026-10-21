/** 2D vector on the ground plane. Uses Three.js ground axes, so no conversion is needed in the View. */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export const ZERO: Vec2 = { x: 0, z: 0 };

export function vec2(x: number, z: number): Vec2 {
  return { x, z };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, z: v.z * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.z);
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Unit vector the car faces for a given heading (0 = -Z, positive = counter-clockwise from above). */
export function forward(heading: number): Vec2 {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

/** Unit vector to the car's right for a given heading. */
export function right(heading: number): Vec2 {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}
