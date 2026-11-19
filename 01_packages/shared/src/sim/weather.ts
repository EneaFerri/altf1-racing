import { CAR_WHEELS } from '../config/car';
import { PUDDLE_PARAMS, type PuddleParams, type WetParams } from '../config/weather';
import { add, dot, scale, sub, toWorld, type Vec2 } from '../math/vec2';
import type { Track } from '../track/types';
import type { CarState } from './car';
import type { SurfaceEffect } from './surface';

/** A wet track, as the simulation feels it (`SimContext.weather`): its params and its puddles. */
export interface WetTrack {
  readonly params: WetParams;
  readonly puddles: readonly Puddle[];
}

/**
 * A puddle on a wet track: a flat ellipse on the asphalt, its long axis along the track. Plain
 * data: the simulation and the view read the same ones.
 */
export interface Puddle {
  readonly center: Vec2;
  /** Unit vector along the track there (the long axis). */
  readonly axis: Vec2;
  /** Unit vector across the track there (the short axis). */
  readonly normal: Vec2;
  readonly halfLength: number;
  readonly halfWidth: number;
}

/**
 * The puddles of `track` when it rains: one chance every `step` m of the main loop, higher round
 * the corners, none on the grid or just after the start line; each lies wholly on the asphalt,
 * inside the kerbs. Deterministic: seeded by the track's name, so the server, every client and
 * the view place exactly the same ones. See 01_docs/weather.md.
 */
export function placePuddles(track: Track, p: PuddleParams = PUDDLE_PARAMS): Puddle[] {
  const random = seededRandom(hashName(track.name));
  const { samples } = track;
  const n = samples.length;
  const spacing = track.length / n;
  const every = Math.max(1, Math.round(p.step / spacing));
  const window = Math.round(p.bendWindow / spacing);
  const puddles: Puddle[] = [];
  for (let i = 0; i < n; i += every) {
    // Every spot draws the same four numbers, kept or not: one change never shifts the rest.
    const [roll, length, width, across] = [random(), random(), random(), random()];
    const s = samples[i]!;
    if (s.distance < p.gridAhead || s.distance > track.length - p.gridBack) continue;
    let bend = 0;
    for (let k = -window; k <= window; k++) {
      bend = Math.max(bend, Math.abs(samples[(i + k + n) % n]!.curvature));
    }
    if (roll >= Math.min(p.maxChance, p.baseChance + bend * p.bendChance)) continue;
    const halfLength = between(p.halfLength, length);
    const halfWidth = between(p.halfWidth, width);
    const room = s.halfWidth - track.kerbInset - p.edgeClearance - halfWidth;
    if (room <= 0) continue;
    puddles.push({
      center: add(s.position, scale(s.normal, (across * 2 - 1) * room)),
      axis: s.tangent,
      normal: s.normal,
      halfLength,
      halfWidth,
    });
  }
  return puddles;
}

/** Whether point `p` lies in one of `puddles`. */
export function inPuddle(p: Vec2, puddles: readonly Puddle[]): boolean {
  return puddles.some((puddle) => {
    const d = sub(p, puddle.center);
    const along = dot(d, puddle.axis) / puddle.halfLength;
    const across = dot(d, puddle.normal) / puddle.halfWidth;
    return along * along + across * across <= 1;
  });
}

/** Share of `car`'s wheels (the four of CAR_WHEELS) in a puddle: 0, ¼, ½, ¾ or 1. */
export function puddleShare(car: CarState, puddles: readonly Puddle[]): number {
  let wet = 0;
  for (const { ahead, side } of CAR_WHEELS) {
    if (inPuddle(toWorld(car.position, car.heading, ahead, side), puddles)) wet++;
  }
  return wet / CAR_WHEELS.length;
}

/**
 * The surfaces' `effect` on a wet track, `share` of the wheels in a puddle: grip, traction and
 * braking scaled by the wet params everywhere, and further by the puddles' for the wheels in one
 * (two wheels in a puddle = half its effect, like the surfaces), plus their drag.
 */
export function wetSurfaceEffect(
  effect: SurfaceEffect,
  share: number,
  p: WetParams,
): SurfaceEffect {
  const puddle = (factor: number): number => 1 + (factor - 1) * share;
  return {
    ...effect,
    grip: effect.grip * p.grip * puddle(p.puddleGrip),
    traction: effect.traction * p.traction * puddle(p.puddleTraction),
    brake: effect.brake * p.brake,
    drag: effect.drag + p.puddleDrag * share,
  };
}

function between([min, max]: readonly [number, number], t: number): number {
  return min + (max - min) * t;
}

/** FNV-1a: a track's name as a seed. */
function hashName(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32: 0..1, the same sequence on every machine for a seed. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
