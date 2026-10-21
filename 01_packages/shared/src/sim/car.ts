import type { CarParams } from '../config/car';
import { moveToward, wrapAngle } from '../math/angle';
import { add, dot, forward, headingOf, length, right, scale, ZERO, type Vec2 } from '../math/vec2';
import type { InputCommand } from '../types/input';

/** Below this forward speed (m/s, ~1 km/h) the brake key engages reverse. */
const REVERSE_ENGAGE_SPEED = 0.3;

export interface CarState {
  readonly position: Vec2;
  /** World-space velocity (m/s). Can point away from `heading` when the car slides. */
  readonly velocity: Vec2;
  /** Facing angle in radians: 0 = -Z, positive = counter-clockwise from above. */
  readonly heading: number;
  /** Rotation speed applied in the last tick (rad/s). */
  readonly yawRate: number;
  /** Smoothed steering, -1 (left) .. 1 (right). */
  readonly steer: number;
  readonly drifting: boolean;
  /** Side locked when the drift started: 1 = right, -1 = left, 0 = not drifting. */
  readonly driftDirection: number;
  /** 0 right after a drift, back to 1 (full grip) over driftRecoveryTime. */
  readonly gripRecovery: number;
}

export function createCar(position: Vec2 = ZERO, heading = 0): CarState {
  return {
    position,
    velocity: ZERO,
    heading,
    yawRate: 0,
    steer: 0,
    drifting: false,
    driftDirection: 0,
    gripRecovery: 1,
  };
}

/** Angle between where the car points and where it travels (rad). Positive = nose right of travel. */
export function slipAngle(car: CarState): number {
  if (length(car.velocity) < 0.5) return 0;
  return wrapAngle(headingOf(car.velocity) - car.heading);
}

/** Advances one car by `dt` seconds. Pure: returns a new state. See 01_docs/physics.md. */
export function stepCar(car: CarState, input: InputCommand, p: CarParams, dt: number): CarState {
  const steer = smoothSteer(car.steer, input.steer, p, dt);
  const vForward = dot(car.velocity, forward(car.heading));
  const speed = length(car.velocity);

  if (car.drifting && input.handbrake && speed >= p.driftExitSpeed) {
    return stepDrift(car, input, steer, p, dt);
  }
  if (!car.drifting && input.handbrake && input.steer !== 0 && vForward > p.driftMinSpeed) {
    return stepDrift(
      { ...car, drifting: true, driftDirection: Math.sign(input.steer) },
      input,
      steer,
      p,
      dt,
    );
  }
  return stepGrip(car, input, steer, p, dt);
}

/** Normal driving: tyres grip, steering sets the yaw rate. */
function stepGrip(
  car: CarState,
  input: InputCommand,
  steer: number,
  p: CarParams,
  dt: number,
): CarState {
  const gripRecovery = car.drifting ? 0 : Math.min(1, car.gripRecovery + dt / p.driftRecoveryTime);
  const grip = p.driftExitGrip + (p.lateralGrip - p.driftExitGrip) * gripRecovery;

  // Split velocity into the car's own frame.
  const fwd = forward(car.heading);
  const side = right(car.heading);
  const vLateralBefore = dot(car.velocity, side);
  let vForward = longitudinal(dot(car.velocity, fwd), input, p, dt);
  if (input.handbrake) vForward = moveToward(vForward, 0, p.handbrakeDecel * dt);
  const vLateral = vLateralBefore * Math.exp(-grip * dt);

  const speed = Math.abs(vForward);
  const lowSpeedFactor = Math.min(1, speed / p.fullTurnSpeed);
  const highSpeedFactor = 1 - p.highSpeedSteerLoss * Math.min(1, speed / p.maxSpeed);
  // Steering right (+) turns clockwise (heading decreases); reversing flips it, like a real car.
  const yawRate = -steer * p.maxYawRate * lowSpeedFactor * highSpeedFactor * Math.sign(vForward);

  let velocity = add(scale(fwd, vForward), scale(side, vLateral));
  if (gripRecovery < 1) {
    // Coming out of a drift: grip straightens the car without eating its speed (arcade reward).
    const keptSpeed = Math.hypot(vForward, vLateralBefore);
    const currentSpeed = length(velocity);
    if (currentSpeed > 0) velocity = scale(velocity, keptSpeed / currentSpeed);
  }

  return {
    position: add(car.position, scale(velocity, dt)),
    velocity,
    heading: wrapAngle(car.heading + yawRate * dt),
    yawRate,
    steer,
    drifting: false,
    driftDirection: 0,
    gripRecovery,
  };
}

/**
 * Arcade drift: the direction of travel turns at a controlled rate and the nose is held at a
 * bounded slip angle into the turn, so a spin-out is impossible by construction.
 */
function stepDrift(
  car: CarState,
  input: InputCommand,
  steer: number,
  p: CarParams,
  dt: number,
): CarState {
  const dir = car.driftDirection;
  // +1 = steering into the drift (tighter), -1 = countersteering (wider).
  const steerInto = steer * dir;

  const speedBefore = length(car.velocity);
  const travelBefore = speedBefore > 0 ? headingOf(car.velocity) : car.heading;
  const turnRate = p.driftTurnRate * (1 + p.driftSteerInfluence * steerInto);
  const travel = wrapAngle(travelBefore - dir * turnRate * dt);

  // Smooth the slip angle itself (not the heading): chasing a heading that keeps turning
  // would always lag behind and never reach the target slip.
  const maxSlip = p.driftAngle + p.driftAngleSteerRange;
  const targetSlip = p.driftAngle + p.driftAngleSteerRange * steerInto;
  const slipBefore = dir * wrapAngle(travelBefore - car.heading);
  const blend = 1 - Math.exp(-p.driftRotateStiffness * dt);
  const slip = Math.min(maxSlip, slipBefore + (targetSlip - slipBefore) * blend);
  const heading = wrapAngle(travel - dir * slip);

  const speed = Math.max(0, longitudinal(speedBefore, input, p, dt) - p.driftDrag * dt);
  const velocity = scale(forward(travel), speed);

  return {
    position: add(car.position, scale(velocity, dt)),
    velocity,
    heading,
    yawRate: wrapAngle(heading - car.heading) / dt,
    steer,
    drifting: true,
    driftDirection: dir,
    gripRecovery: 0,
  };
}

function smoothSteer(current: number, target: number, p: CarParams, dt: number): number {
  const returning = target === 0 || Math.sign(target) !== Math.sign(current);
  return moveToward(current, target, (returning ? p.steerReturnSpeed : p.steerSpeed) * dt);
}

/** New forward speed after engine, brakes and drag. */
function longitudinal(vForward: number, input: InputCommand, p: CarParams, dt: number): number {
  let v = vForward;

  if (input.throttle > 0) {
    v =
      v >= 0
        ? v + p.engineAccel * input.throttle * (1 - v / p.maxSpeed) * dt
        : moveToward(v, 0, p.brakeDecel * input.throttle * dt); // throttle while rolling back = brake
  }

  if (input.brake > 0) {
    v =
      v > REVERSE_ENGAGE_SPEED
        ? moveToward(v, 0, p.brakeDecel * input.brake * dt)
        : Math.max(v - p.reverseAccel * input.brake * dt, -p.maxReverseSpeed);
  }

  if (input.throttle === 0 && input.brake === 0) {
    v = moveToward(v, 0, p.coastDecel * dt);
  }

  return moveToward(v, 0, p.airDrag * v * v * dt);
}
