/**
 * Handling parameters. Units are SI (m, s, m/s, rad). Meaning and effect of each
 * value are documented in 01_docs/physics.md. Values: provisional baseline, see config/tuning.ts.
 */
export interface CarParams {
  /** Engine speed limit: thrust fades to 0 here. Real top speed is lower because of air drag. */
  maxSpeed: number;
  /** Forward acceleration from standstill at full throttle (m/s²). */
  engineAccel: number;
  /** Braking deceleration at full brake pressure (m/s²). */
  brakeDecel: number;
  /** Brake pressure (0..1) the instant the brake is pressed: a tap already slows the car. */
  brakeInitialPressure: number;
  /** Time held to go from brakeInitialPressure to full pressure (s). */
  brakeRampTime: number;
  /** Time for the pressure to drop from full to 0 once released (s). */
  brakeReleaseTime: number;
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
  /** How quickly the actual yaw rate follows the steering (1/s). Lower = smoother, lazier turn-in. */
  yawResponse: number;
  /** Below this speed steering authority fades towards 0, so the car can't turn on the spot. */
  fullTurnSpeed: number;
  /** Fraction of steering lost at maxSpeed (0 = none, 1 = all). */
  highSpeedSteerLoss: number;
  /** How quickly sideways sliding is killed (1/s). Higher = more grip. */
  lateralGrip: number;

  /** How quickly external spin (kerb kicks, impacts) dies out (1/s). */
  spinDamping: number;
}

export const CAR_PARAMS: CarParams = {
  maxSpeed: 80,
  engineAccel: 18,
  brakeDecel: 30,
  brakeInitialPressure: 0.3,
  brakeRampTime: 0.6,
  brakeReleaseTime: 0.1,
  reverseAccel: 8,
  maxReverseSpeed: 10,
  coastDecel: 1.5,
  airDrag: 0.0005,
  steerSpeed: 3,
  steerReturnSpeed: 5,
  maxYawRate: 2.7,
  yawResponse: 9.5,
  fullTurnSpeed: 8,
  highSpeedSteerLoss: 0.6,
  lateralGrip: 6,

  spinDamping: 4,
};

/**
 * Wheel contact points in the car's local frame (m): `ahead` along forward, `side` along right.
 * Order: front-left, front-right, rear-left, rear-right. Shared by surface sampling and CarView.
 */
export const CAR_WHEELS = [
  { ahead: 1.5, side: -0.95 },
  { ahead: 1.5, side: 0.95 },
  { ahead: -1.4, side: -0.95 },
  { ahead: -1.4, side: 0.95 },
] as const;
