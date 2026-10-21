import type { CarParams } from '../config/car';
import { moveToward, wrapAngle } from '../math/angle';
import { add, dot, forward, right, scale, ZERO, type Vec2 } from '../math/vec2';
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
}

export function createCar(position: Vec2 = ZERO, heading = 0): CarState {
  return { position, velocity: ZERO, heading, yawRate: 0, steer: 0 };
}

/** Advances one car by `dt` seconds. Pure: returns a new state. See 01_docs/physics.md. */
export function stepCar(car: CarState, input: InputCommand, p: CarParams, dt: number): CarState {
  const steer = smoothSteer(car.steer, input.steer, p, dt);

  // Split velocity into the car's own frame.
  const fwd = forward(car.heading);
  const side = right(car.heading);
  const vForward = longitudinal(dot(car.velocity, fwd), input, p, dt);
  const vLateral = dot(car.velocity, side) * Math.exp(-p.lateralGrip * dt);

  const speed = Math.abs(vForward);
  const lowSpeedFactor = Math.min(1, speed / p.fullTurnSpeed);
  const highSpeedFactor = 1 - p.highSpeedSteerLoss * Math.min(1, speed / p.maxSpeed);
  // Steering right (+) turns clockwise (heading decreases); reversing flips it, like a real car.
  const yawRate = -steer * p.maxYawRate * lowSpeedFactor * highSpeedFactor * Math.sign(vForward);

  const velocity = add(scale(fwd, vForward), scale(side, vLateral));
  return {
    position: add(car.position, scale(velocity, dt)),
    velocity,
    heading: wrapAngle(car.heading + yawRate * dt),
    yawRate,
    steer,
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
