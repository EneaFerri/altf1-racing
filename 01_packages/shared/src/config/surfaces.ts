import type { Surface } from '../track/query';

/** How a surface affects a car. Averaged over the four wheels. See 01_docs/track.md. */
export interface SurfaceParams {
  /** Multiplies lateral grip. */
  grip: number;
  /** Multiplies engine thrust and braking. */
  traction: number;
  /** Extra deceleration (m/s²). */
  drag: number;
  /** Yaw kick (rad/s, at 30 m/s) when a wheel climbs onto this surface; 0 = smooth. Also ends drifts. */
  bumpSpin: number;
}

export const SURFACE_PARAMS: Record<Surface, SurfaceParams> = {
  asphalt: { grip: 1, traction: 1, drag: 0, bumpSpin: 0 },
  kerb: { grip: 0.85, traction: 0.95, drag: 0.5, bumpSpin: 0 },
  highKerb: { grip: 0.45, traction: 0.7, drag: 4, bumpSpin: 0.9 },
  grass: { grip: 0.5, traction: 0.6, drag: 5, bumpSpin: 0 },
  gravel: { grip: 0.35, traction: 0.4, drag: 14, bumpSpin: 0 },
};
