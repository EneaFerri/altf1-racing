import type { CarParams } from '../config/car';
import { moveToward, wrapAngle } from '../math/angle';
import { add, dot, forward, headingOf, length, right, scale, ZERO, type Vec2 } from '../math/vec2';
import type { Surface } from '../track/types';
import type { InputCommand } from '../types/input';
import { NO_SLIPSTREAM, type SlipstreamEffect } from './slipstream';
import { NEUTRAL_SURFACE_EFFECT, type SurfaceEffect } from './surface';

/** Below this forward speed (m/s, ~1 km/h) the reverse key drives backwards instead of braking. */
const REVERSE_ENGAGE_SPEED = 0.3;

export type CarId = string;

export interface CarState {
  readonly id: CarId;
  readonly position: Vec2;
  /** World-space velocity (m/s). Points slightly away from `heading` in corners (slip). */
  readonly velocity: Vec2;
  /** Facing angle in radians: 0 = -Z, positive = counter-clockwise from above. */
  readonly heading: number;
  /** Smoothed turn rate of the heading (rad/s). It has inertia (yawResponse), so turning in and out is never a step. */
  readonly yawRate: number;
  /** Extra rotation from external kicks (high kerbs, impacts), decays over time (rad/s). */
  readonly spin: number;
  /** Smoothed steering, -1 (left) .. 1 (right). */
  readonly steer: number;
  /** Brake pressure 0..1: builds up while the brake is held, drops quickly once released. */
  readonly brakePressure: number;
  /** Surface under each wheel (order of CAR_WHEELS), sampled at the start of the last tick. */
  readonly wheelSurfaces: readonly Surface[];
  /** How much the car was towed by another car's wake in the last tick (0..1), see sim/slipstream.ts. */
  readonly slipstream: number;
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
    brakePressure: 0,
    wheelSurfaces: ['asphalt', 'asphalt', 'asphalt', 'asphalt'],
    slipstream: 0,
  };
}

/** Angle between where the car points and where it travels (rad). Positive = nose right of travel. */
export function slipAngle(car: CarState): number {
  if (length(car.velocity) < 0.5) return 0;
  return wrapAngle(headingOf(car.velocity) - car.heading);
}

/**
 * Advances one car by `dt` seconds on the given surface, towed by `slip`. Pure: returns a new state.
 * Tyres always grip; see 01_docs/physics.md.
 */
export function stepCar(
  car: CarState,
  input: InputCommand,
  p: CarParams,
  dt: number,
  surface: SurfaceEffect = NEUTRAL_SURFACE_EFFECT,
  slip: SlipstreamEffect = NO_SLIPSTREAM,
): CarState {
  const steer = smoothSteer(car.steer, input.steer, p, dt);
  const spin = (car.spin + surface.spinKick) * Math.exp(-p.spinDamping * dt);
  const brakePressure = smoothBrake(
    car.brakePressure,
    input,
    dot(car.velocity, forward(car.heading)),
    p,
    dt,
  );
  const grip = p.lateralGrip * surface.grip;

  // Split velocity into the car's own frame.
  const fwd = forward(car.heading);
  const side = right(car.heading);
  const vForward = longitudinal(dot(car.velocity, fwd), brakePressure, input, p, dt, surface, slip);
  const vLateral = dot(car.velocity, side) * Math.exp(-grip * dt);

  const speed = Math.abs(vForward);
  const lowSpeedFactor = Math.min(1, speed / p.fullTurnSpeed);
  const highSpeedFactor = 1 - p.highSpeedSteerLoss * Math.min(1, speed / p.maxSpeed);
  // Steering right (+) turns clockwise (heading decreases); reversing flips it, like a real car.
  const targetYaw = -steer * p.maxYawRate * lowSpeedFactor * highSpeedFactor * Math.sign(vForward);
  const yawRate = approach(car.yawRate, targetYaw, p.yawResponse, dt);

  const velocity = add(scale(fwd, vForward), scale(side, vLateral));
  return {
    ...car,
    position: add(car.position, scale(velocity, dt)),
    velocity,
    heading: wrapAngle(car.heading + (yawRate + spin) * dt),
    yawRate,
    spin,
    steer,
    brakePressure,
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

/**
 * Brake pressure after this tick. The brake asks for `input.brake`, and so does the reverse key while
 * still rolling forward. Pressing jumps to brakeInitialPressure, holding ramps up to full over
 * brakeRampTime, releasing drops to 0 over brakeReleaseTime.
 */
function smoothBrake(
  current: number,
  input: InputCommand,
  vForward: number,
  p: CarParams,
  dt: number,
): number {
  const demand = Math.max(input.brake, vForward > REVERSE_ENGAGE_SPEED ? input.reverse : 0);
  if (current > demand) return moveToward(current, demand, dt / p.brakeReleaseTime);
  const ramped = moveToward(current, demand, ((1 - p.brakeInitialPressure) / p.brakeRampTime) * dt);
  return Math.max(ramped, p.brakeInitialPressure * demand);
}

/** New forward speed after engine, slipstream tow, brakes, reverse, drag and surface. */
function longitudinal(
  vForward: number,
  brakePressure: number,
  input: InputCommand,
  p: CarParams,
  dt: number,
  surface: SurfaceEffect,
  slip: SlipstreamEffect,
): number {
  let v = vForward;
  const traction = surface.traction;

  if (input.throttle > 0) {
    v =
      v >= 0
        ? v + p.engineAccel * traction * input.throttle * (1 - v / p.maxSpeed) * dt
        : moveToward(v, 0, p.brakeDecel * traction * input.throttle * dt); // throttle while rolling back = brake
    if (vForward >= 0) v += slip.towAccel * input.throttle * dt;
  }

  // The brake stops the car whichever way it rolls; only the reverse key drives backwards.
  if (brakePressure > 0) v = moveToward(v, 0, p.brakeDecel * traction * brakePressure * dt);

  if (input.reverse > 0 && v <= REVERSE_ENGAGE_SPEED) {
    v = Math.max(v - p.reverseAccel * traction * input.reverse * dt, -p.maxReverseSpeed);
  }

  if (input.throttle === 0 && input.brake === 0 && input.reverse === 0) {
    v = moveToward(v, 0, p.coastDecel * dt);
  }

  v = moveToward(v, 0, surface.drag * dt);
  return moveToward(v, 0, p.airDrag * slip.dragScale * v * v * dt);
}
