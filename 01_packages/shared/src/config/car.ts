/**
 * Handling parameters. Units are SI (m, s, m/s, rad). Meaning and effect of each
 * value are documented in 01_docs/physics.md. Starting values, tuned in Phase 1 step 7.
 */
export interface CarParams {
  /** Engine speed limit: thrust fades to 0 here. Real top speed is lower because of air drag. */
  maxSpeed: number;
  /** Forward acceleration from standstill at full throttle (m/s²). */
  engineAccel: number;
  /** Braking deceleration (m/s²). */
  brakeDecel: number;
  /** Acceleration in reverse (m/s²). */
  reverseAccel: number;
  maxReverseSpeed: number;
  /** Deceleration when no pedal is pressed (m/s²). */
  coastDecel: number;
  /** Quadratic air drag coefficient: deceleration = airDrag · speed². */
  airDrag: number;
  /** How fast the steering moves towards the input (full lock per second). */
  steerSpeed: number;
  /** How fast the steering re-centres when released or reversed. */
  steerReturnSpeed: number;
  /** Yaw rate at full lock (rad/s). */
  maxYawRate: number;
  /** Below this speed steering authority fades towards 0, so the car can't turn on the spot. */
  fullTurnSpeed: number;
  /** Fraction of steering lost at maxSpeed (0 = none, 1 = all). */
  highSpeedSteerLoss: number;
  /** How quickly sideways sliding is killed (1/s). Higher = more grip. */
  lateralGrip: number;
}

export const CAR_PARAMS: CarParams = {
  maxSpeed: 80,
  engineAccel: 18,
  brakeDecel: 30,
  reverseAccel: 8,
  maxReverseSpeed: 10,
  coastDecel: 1.5,
  airDrag: 0.0005,
  steerSpeed: 4,
  steerReturnSpeed: 6,
  maxYawRate: 2.2,
  fullTurnSpeed: 8,
  highSpeedSteerLoss: 0.5,
  lateralGrip: 8,
};
