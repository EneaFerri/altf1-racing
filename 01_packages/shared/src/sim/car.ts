import type { CarParams } from '../config/car';
import { moveToward, wrapAngle } from '../math/angle';
import { add, dot, forward, headingOf, length, right, scale, ZERO, type Vec2 } from '../math/vec2';
import type { Surface } from '../track/types';
import type { InputCommand } from '../types/input';
import { NEUTRAL_SURFACE_EFFECT, type SurfaceEffect } from './surface';

/** Below this forward speed (m/s, ~1 km/h) the brake key engages reverse. */
const REVERSE_ENGAGE_SPEED = 0.3;

export type CarId = string;

export interface CarState {
  readonly id: CarId;
  readonly position: Vec2;
  /** World-space velocity (m/s). Can point away from `heading` when the car slides. */
  readonly velocity: Vec2;
  /** Facing angle in radians: 0 = -Z, positive = counter-clockwise from above. */
  readonly heading: number;
  /**
   * Smoothed turn rate (rad/s): of the heading in grip mode, of the direction of travel in drift.
   * It has inertia (yawResponse / driftTurnResponse), so turning in and out is never a step.
   */
  readonly yawRate: number;
  /** Extra rotation from external kicks (high kerbs, impacts), decays over time (rad/s). */
  readonly spin: number;
  /** Smoothed steering, -1 (left) .. 1 (right). */
  readonly steer: number;
  readonly drifting: boolean;
  /** Side locked when the drift started: 1 = right, -1 = left, 0 = not drifting. */
  readonly driftDirection: number;
  /** 0 right after a drift, back to 1 (full grip) over driftRecoveryTime. */
  readonly gripRecovery: number;
  /** Surface under each wheel (order of CAR_WHEELS), sampled at the start of the last tick. */
  readonly wheelSurfaces: readonly Surface[];
}

export interface CarSpawn {
  readonly id?: CarId;
  readonly position?: Vec2;
  readonly heading?: number;
}

export function createCar({ id = 'car', position = ZERO, heading = 0 }: CarSpawn = {}): CarState {
  return {
    id,
    position,
    velocity: ZERO,
    heading,
    yawRate: 0,
    spin: 0,
    steer: 0,
    drifting: false,
    driftDirection: 0,
    gripRecovery: 1,
    wheelSurfaces: ['asphalt', 'asphalt', 'asphalt', 'asphalt'],
  };
}

/** Angle between where the car points and where it travels (rad). Positive = nose right of travel. */
export function slipAngle(car: CarState): number {
  if (length(car.velocity) < 0.5) return 0;
  return wrapAngle(headingOf(car.velocity) - car.heading);
}

/**
 * Advances one car by `dt` seconds on the given surface. Pure: returns a new state.
 * See 01_docs/physics.md.
 */
export function stepCar(
  car: CarState,
  input: InputCommand,
  p: CarParams,
  dt: number,
  surface: SurfaceEffect = NEUTRAL_SURFACE_EFFECT,
): CarState {
  const steer = smoothSteer(car.steer, input.steer, p, dt);
  const spin = (car.spin + surface.spinKick) * Math.exp(-p.spinDamping * dt);
  const vForward = dot(car.velocity, forward(car.heading));
  const speed = length(car.velocity);
  const canDrift = input.handbrake && !surface.breaksDrift;

  if (car.drifting && canDrift && speed >= p.driftExitSpeed) {
    return stepDrift(car, input, steer, spin, p, dt, surface);
  }
  if (!car.drifting && canDrift && input.steer !== 0 && vForward > p.driftMinSpeed) {
    const entering = { ...car, drifting: true, driftDirection: Math.sign(input.steer) };
    return stepDrift(entering, input, steer, spin, p, dt, surface);
  }
  return stepGrip(car, input, steer, spin, p, dt, surface);
}

/** Normal driving: tyres grip, steering sets the yaw rate. */
function stepGrip(
  car: CarState,
  input: InputCommand,
  steer: number,
  spin: number,
  p: CarParams,
  dt: number,
  surface: SurfaceEffect,
): CarState {
  const gripRecovery = car.drifting ? 0 : Math.min(1, car.gripRecovery + dt / p.driftRecoveryTime);
  const grip = (p.driftExitGrip + (p.lateralGrip - p.driftExitGrip) * gripRecovery) * surface.grip;

  // Split velocity into the car's own frame.
  const fwd = forward(car.heading);
  const side = right(car.heading);
  const vLateralBefore = dot(car.velocity, side);
  let vForward = longitudinal(dot(car.velocity, fwd), input, p, dt, surface);
  if (input.handbrake) vForward = moveToward(vForward, 0, p.handbrakeDecel * dt);
  const vLateral = vLateralBefore * Math.exp(-grip * dt);

  const speed = Math.abs(vForward);
  const lowSpeedFactor = Math.min(1, speed / p.fullTurnSpeed);
  const highSpeedFactor = 1 - p.highSpeedSteerLoss * Math.min(1, speed / p.maxSpeed);
  // Steering right (+) turns clockwise (heading decreases); reversing flips it, like a real car.
  const targetYaw = -steer * p.maxYawRate * lowSpeedFactor * highSpeedFactor * Math.sign(vForward);
  const yawRate = approach(car.yawRate, targetYaw, p.yawResponse, dt);

  let velocity = add(scale(fwd, vForward), scale(side, vLateral));
  if (gripRecovery < 1) {
    // Coming out of a drift: grip straightens the car without eating its speed (arcade reward).
    const keptSpeed = Math.hypot(vForward, vLateralBefore);
    const currentSpeed = length(velocity);
    if (currentSpeed > 0) velocity = scale(velocity, keptSpeed / currentSpeed);
  }

  return {
    ...car,
    position: add(car.position, scale(velocity, dt)),
    velocity,
    heading: wrapAngle(car.heading + (yawRate + spin) * dt),
    yawRate,
    spin,
    steer,
    drifting: false,
    driftDirection: 0,
    gripRecovery,
  };
}

/**
 * Arcade drift: the direction of travel turns at a controlled rate and the nose is held at a
 * bounded slip angle into the turn, so a spin-out is impossible by construction.
 * External `spin` keeps decaying but does not rotate a drifting car (strong kicks end the drift).
 */
function stepDrift(
  car: CarState,
  input: InputCommand,
  steer: number,
  spin: number,
  p: CarParams,
  dt: number,
  surface: SurfaceEffect,
): CarState {
  const dir = car.driftDirection;
  // +1 = steering into the drift (tighter), -1 = countersteering (wider).
  const steerInto = steer * dir;

  const speedBefore = length(car.velocity);
  const travelBefore = speedBefore > 0 ? headingOf(car.velocity) : car.heading;
  // The travel direction's turn rate blends from the current one (the corner you were already
  // taking) towards the drift's, so the drift continues the line instead of snapping onto a new one.
  const targetTurn = -dir * p.driftTurnRate * (1 + p.driftSteerInfluence * steerInto);
  const travelTurn = approach(car.yawRate, targetTurn, p.driftTurnResponse, dt);
  const travel = wrapAngle(travelBefore + travelTurn * dt);

  // Smooth the slip angle itself (not the heading): chasing a heading that keeps turning
  // would always lag behind and never reach the target slip.
  const maxSlip = p.driftAngle + p.driftAngleSteerRange;
  const targetSlip = p.driftAngle + p.driftAngleSteerRange * steerInto;
  const slipBefore = dir * wrapAngle(travelBefore - car.heading);
  const blend = 1 - Math.exp(-p.driftRotateStiffness * dt);
  // Capped at maxSlip, unless an impact already pushed it past: then it eases back instead of snapping.
  const slip = Math.min(
    Math.max(maxSlip, slipBefore),
    slipBefore + (targetSlip - slipBefore) * blend,
  );
  const heading = wrapAngle(travel - dir * slip);

  const speed = Math.max(0, longitudinal(speedBefore, input, p, dt, surface) - p.driftDrag * dt);
  const velocity = scale(forward(travel), speed);

  return {
    ...car,
    position: add(car.position, scale(velocity, dt)),
    velocity,
    heading,
    yawRate: travelTurn,
    spin,
    steer,
    drifting: true,
    driftDirection: dir,
    gripRecovery: 0,
  };
}

/** Frame-rate independent exponential approach of `value` towards `target` at `rate` (1/s). */
function approach(value: number, target: number, rate: number, dt: number): number {
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}

function smoothSteer(current: number, target: number, p: CarParams, dt: number): number {
  const returning = target === 0 || Math.sign(target) !== Math.sign(current);
  return moveToward(current, target, (returning ? p.steerReturnSpeed : p.steerSpeed) * dt);
}

/** New forward speed after engine, brakes, drag and surface. */
function longitudinal(
  vForward: number,
  input: InputCommand,
  p: CarParams,
  dt: number,
  surface: SurfaceEffect,
): number {
  let v = vForward;
  const traction = surface.traction;

  if (input.throttle > 0) {
    v =
      v >= 0
        ? v + p.engineAccel * traction * input.throttle * (1 - v / p.maxSpeed) * dt
        : moveToward(v, 0, p.brakeDecel * traction * input.throttle * dt); // throttle while rolling back = brake
  }

  if (input.brake > 0) {
    v =
      v > REVERSE_ENGAGE_SPEED
        ? moveToward(v, 0, p.brakeDecel * traction * input.brake * dt)
        : Math.max(v - p.reverseAccel * traction * input.brake * dt, -p.maxReverseSpeed);
  }

  if (input.throttle === 0 && input.brake === 0) {
    v = moveToward(v, 0, p.coastDecel * dt);
  }

  v = moveToward(v, 0, surface.drag * dt);
  return moveToward(v, 0, p.airDrag * v * v * dt);
}
