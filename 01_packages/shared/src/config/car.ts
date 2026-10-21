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
  /** How quickly the actual yaw rate follows the steering (1/s). Lower = smoother, lazier turn-in. */
  yawResponse: number;
  /** Below this speed steering authority fades towards 0, so the car can't turn on the spot. */
  fullTurnSpeed: number;
  /** Fraction of steering lost at maxSpeed (0 = none, 1 = all). */
  highSpeedSteerLoss: number;
  /** How quickly sideways sliding is killed (1/s). Higher = more grip. */
  lateralGrip: number;

  /** Deceleration from the handbrake when not drifting (m/s²). */
  handbrakeDecel: number;
  /** Forward speed needed to start a drift (m/s). */
  driftMinSpeed: number;
  /** A drift ends when speed drops below this (m/s). Lower than driftMinSpeed for hysteresis. */
  driftExitSpeed: number;
  /** How fast the direction of travel turns while drifting (rad/s). */
  driftTurnRate: number;
  /** How quickly the drift's turn rate takes over from the one at entry (1/s). Lower = smoother entry. */
  driftTurnResponse: number;
  /** How much steering tightens (into the drift) or widens (countersteer) the turn, 0..1. */
  driftSteerInfluence: number;
  /** Slip angle with neutral steering (rad). */
  driftAngle: number;
  /** Steering moves the slip angle by up to ± this (rad). Max slip = driftAngle + driftAngleSteerRange. */
  driftAngleSteerRange: number;
  /** How quickly the nose swings to the target slip angle (1/s). */
  driftRotateStiffness: number;
  /** Speed lost per second while drifting (m/s²). */
  driftDrag: number;
  /** Lateral grip right after a drift ends (1/s); recovers to lateralGrip over driftRecoveryTime. */
  driftExitGrip: number;
  /** Time to get full grip back after a drift (s). */
  driftRecoveryTime: number;

  /** How quickly external spin (kerb kicks, impacts) dies out (1/s). */
  spinDamping: number;
}

export const CAR_PARAMS: CarParams = {
  maxSpeed: 80,
  engineAccel: 18,
  brakeDecel: 30,
  reverseAccel: 8,
  maxReverseSpeed: 10,
  coastDecel: 1.5,
  airDrag: 0.0005,
  steerSpeed: 3,
  steerReturnSpeed: 5,
  maxYawRate: 1.8,
  yawResponse: 7,
  fullTurnSpeed: 8,
  highSpeedSteerLoss: 0.6,
  lateralGrip: 6,

  handbrakeDecel: 6,
  driftMinSpeed: 12,
  driftExitSpeed: 8,
  driftTurnRate: 1.5,
  driftTurnResponse: 3,
  driftSteerInfluence: 0.4,
  driftAngle: 0.35,
  driftAngleSteerRange: 0.18,
  driftRotateStiffness: 3.5,
  driftDrag: 2,
  driftExitGrip: 2,
  driftRecoveryTime: 0.4,

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
