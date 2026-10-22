/**
 * Camera tuning values. View-only (they never affect the simulation), so they live in the client.
 * Editable live in the dev tuning panel (F2 → Camera). See 01_docs/architecture.md.
 * Values: provisional baseline, see TUNING_BASELINE in shared config/tuning.ts.
 */
export interface CameraParams {
  /** Chase: distance behind the car (m). */
  distance: number;
  /** Chase: camera height above the ground (m). */
  height: number;
  /** Chase: the camera aims this far ahead of the car (m). */
  lookAhead: number;
  /** Chase: height of the aim point (m). */
  lookHeight: number;
  /** Chase: how quickly the camera swings round behind the car (1/s). Lower = more of the flank shows in turns. */
  yawStiffness: number;
  /** Chase: vertical field of view at rest (degrees). */
  fov: number;

  /** POV: eye position along the car, from its centre (m, + = towards the nose). */
  eyeAhead: number;
  /** POV: eye height above the ground (m). */
  eyeHeight: number;
  /** POV: tilt of the view (rad, negative = looking down). */
  pitch: number;
  /** POV: vertical field of view at rest (degrees). */
  povFov: number;

  /** Both: extra field of view at `fovSpeedRef` (degrees), for a sense of speed. */
  fovSpeedGain: number;
  /** Both: speed at which the full `fovSpeedGain` is reached (m/s). */
  fovSpeedRef: number;
  /** Both: how quickly the field of view follows the speed (1/s). */
  fovStiffness: number;
}

export const CAMERA_PARAMS: CameraParams = {
  distance: 7,
  height: 3,
  lookAhead: 1.1,
  lookHeight: 1.1,
  yawStiffness: 5,
  fov: 70,

  eyeAhead: -1.1,
  eyeHeight: 2,
  pitch: -0.07,
  povFov: 100,

  fovSpeedGain: 25,
  fovSpeedRef: 71,
  fovStiffness: 10,
};
