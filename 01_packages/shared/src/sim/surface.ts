import { CAR_WHEELS } from '../config/car';
import type { SurfaceParams } from '../config/surfaces';
import { length, toWorld } from '../math/vec2';
import { surfaceAt, type Surface } from '../track/query';
import type { Track } from '../track/types';
import type { CarState } from './car';

/** Combined effect of the surfaces under a car's wheels for one tick. */
export interface SurfaceEffect {
  readonly grip: number;
  readonly traction: number;
  readonly drag: number;
  /** Yaw kick to add this tick (rad/s). */
  readonly spinKick: number;
  /** A wheel just hit a bumpy surface: no drifting this tick. */
  readonly breaksDrift: boolean;
}

export const NEUTRAL_SURFACE_EFFECT: SurfaceEffect = {
  grip: 1,
  traction: 1,
  drag: 0,
  spinKick: 0,
  breaksDrift: false,
};

/** Speed at which a bump gives exactly `bumpSpin` (m/s); faster = harder kick, up to 1.5×. */
const BUMP_REFERENCE_SPEED = 30;

export function sampleWheelSurfaces(track: Track, car: CarState): Surface[] {
  return CAR_WHEELS.map(({ ahead, side }) =>
    surfaceAt(track, toWorld(car.position, car.heading, ahead, side)),
  );
}

/**
 * Averages the wheels' surfaces (two wheels on a kerb = half the effect) and adds a yaw kick
 * for each wheel that just climbed onto a bumpy surface (high kerb).
 */
export function surfaceEffect(
  previous: readonly Surface[],
  current: readonly Surface[],
  speed: number,
  params: Readonly<Record<Surface, SurfaceParams>>,
): SurfaceEffect {
  let grip = 0;
  let traction = 0;
  let drag = 0;
  let spinKick = 0;
  const speedFactor = Math.min(1.5, speed / BUMP_REFERENCE_SPEED);

  current.forEach((surface, wheel) => {
    const p = params[surface];
    grip += p.grip / current.length;
    traction += p.traction / current.length;
    drag += p.drag / current.length;
    if (p.bumpSpin > 0 && previous[wheel] !== surface) {
      // A left wheel (even index) knocks the nose right (heading decreases), and vice versa.
      const sideSign = wheel % 2 === 0 ? -1 : 1;
      spinKick += sideSign * p.bumpSpin * speedFactor;
    }
  });

  return { grip, traction, drag, spinKick, breaksDrift: spinKick !== 0 };
}

/** Convenience for stepGame: sample + combine in one call. */
export function carSurface(
  track: Track,
  car: CarState,
  params: Readonly<Record<Surface, SurfaceParams>>,
): { surfaces: Surface[]; effect: SurfaceEffect } {
  const surfaces = sampleWheelSurfaces(track, car);
  return {
    surfaces,
    effect: surfaceEffect(car.wheelSurfaces, surfaces, length(car.velocity), params),
  };
}
