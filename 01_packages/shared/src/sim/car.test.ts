import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { FIXED_DT, TICK_RATE } from '../config/sim';
import { dot, forward, length, right, scale } from '../math/vec2';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import { createCar, stepCar, type CarState } from './car';
import { NEUTRAL_SURFACE_EFFECT, type SurfaceEffect } from './surface';

const THROTTLE: InputCommand = { ...NEUTRAL_INPUT, throttle: 1 };
const BRAKE: InputCommand = { ...NEUTRAL_INPUT, brake: 1 };
const REVERSE: InputCommand = { ...NEUTRAL_INPUT, reverse: 1 };

function run(car: CarState, input: InputCommand, seconds: number): CarState {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    car = stepCar(car, input, CAR_PARAMS, FIXED_DT);
  }
  return car;
}

const forwardSpeed = (car: CarState): number => dot(car.velocity, forward(car.heading));

describe('stepCar — longitudinal', () => {
  it('accelerates from rest with throttle', () => {
    expect(forwardSpeed(run(createCar(), THROTTLE, 1))).toBeGreaterThan(10);
  });

  it('never exceeds maxSpeed', () => {
    expect(length(run(createCar(), THROTTLE, 60).velocity)).toBeLessThan(CAR_PARAMS.maxSpeed);
  });

  it('coasts down to a full stop without rolling backwards', () => {
    const moving = run(createCar(), THROTTLE, 2);
    expect(forwardSpeed(run(moving, NEUTRAL_INPUT, 60))).toBe(0);
  });

  it('the brake stops the car and never reverses', () => {
    const moving = run(createCar(), THROTTLE, 2);
    expect(forwardSpeed(run(moving, BRAKE, 10))).toBe(0);
  });

  it('the reverse key brakes to a stop, then reverses up to maxReverseSpeed', () => {
    const moving = run(createCar(), THROTTLE, 2);
    const stopped = run(moving, REVERSE, 1.5);
    expect(forwardSpeed(stopped)).toBeLessThanOrEqual(0);
    expect(forwardSpeed(run(stopped, REVERSE, 10))).toBeCloseTo(-CAR_PARAMS.maxReverseSpeed);
  });
});

describe('stepCar — brake pressure', () => {
  const moving: CarState = { ...createCar(), velocity: scale(forward(0), 40) };
  const { brakeInitialPressure, brakeRampTime, brakeReleaseTime } = CAR_PARAMS;

  it('a tap brakes at brakeInitialPressure, holding reaches full pressure after brakeRampTime', () => {
    const tapped = stepCar(moving, BRAKE, CAR_PARAMS, FIXED_DT);
    expect(tapped.brakePressure).toBeGreaterThanOrEqual(brakeInitialPressure);
    expect(tapped.brakePressure).toBeLessThan(brakeInitialPressure + 0.05);
    expect(run(moving, BRAKE, brakeRampTime * 0.5).brakePressure).toBeLessThan(1);
    expect(run(moving, BRAKE, brakeRampTime + FIXED_DT).brakePressure).toBe(1);
  });

  it('drops to 0 over brakeReleaseTime once released', () => {
    const held = run(moving, BRAKE, 1);
    expect(run(held, NEUTRAL_INPUT, brakeReleaseTime * 0.5).brakePressure).toBeGreaterThan(0);
    expect(run(held, NEUTRAL_INPUT, brakeReleaseTime + FIXED_DT).brakePressure).toBe(0);
  });

  it('holding brakes harder than tapping', () => {
    const held = run(moving, BRAKE, 1);
    let tapped = moving;
    for (let i = 0; i < TICK_RATE; i++) {
      tapped = stepCar(tapped, i % 12 < 3 ? BRAKE : NEUTRAL_INPUT, CAR_PARAMS, FIXED_DT);
    }
    expect(forwardSpeed(held)).toBeLessThan(forwardSpeed(tapped));
  });
});

describe('stepCar — steering', () => {
  it('does not turn while standing still', () => {
    const car = run(createCar(), { ...NEUTRAL_INPUT, steer: 1 }, 1);
    expect(car.heading).toBe(0);
  });

  it('turns right (heading decreases) when steering right going forward', () => {
    const moving = run(createCar(), THROTTLE, 2);
    const turned = run(moving, { ...THROTTLE, steer: 1 }, 0.5);
    expect(turned.heading).toBeLessThan(moving.heading);
  });

  it('inverts steering in reverse', () => {
    const reversing = run(createCar(), REVERSE, 2);
    const turned = run(reversing, { ...REVERSE, steer: 1 }, 0.5);
    expect(turned.heading).toBeGreaterThan(reversing.heading);
  });

  it('smooths steering instead of jumping to full lock', () => {
    const car = stepCar(createCar(), { ...NEUTRAL_INPUT, steer: 1 }, CAR_PARAMS, FIXED_DT);
    expect(car.steer).toBeGreaterThan(0);
    expect(car.steer).toBeLessThan(1);
  });

  it('kills sideways sliding over time', () => {
    const sliding: CarState = { ...createCar(), velocity: scale(right(0), 10) };
    const later = run(sliding, NEUTRAL_INPUT, 1);
    expect(Math.abs(dot(later.velocity, right(later.heading)))).toBeLessThan(0.1);
  });
});

describe('stepCar — purity', () => {
  it('does not mutate the input state', () => {
    const car = createCar();
    const snapshot: CarState = JSON.parse(JSON.stringify(car));
    stepCar(car, THROTTLE, CAR_PARAMS, FIXED_DT);
    expect(car).toEqual(snapshot);
  });

  it('is deterministic: same inputs give the exact same state', () => {
    const script = (tick: number): InputCommand => ({
      throttle: tick % 200 < 150 ? 1 : 0,
      brake: tick % 200 >= 180 || tick % 300 > 270 ? 1 : 0,
      reverse: tick % 500 > 480 ? 1 : 0,
      steer: Math.sin(tick / 40) > 0 ? 1 : -1,
      reset: false,
    });
    const simulate = (): CarState => {
      let car = createCar();
      for (let tick = 0; tick < 1000; tick++)
        car = stepCar(car, script(tick), CAR_PARAMS, FIXED_DT);
      return car;
    };
    expect(simulate()).toEqual(simulate());
  });
});

describe('stepCar — surfaces and spin', () => {
  const on = (effect: Partial<SurfaceEffect>): SurfaceEffect => ({
    ...NEUTRAL_SURFACE_EFFECT,
    ...effect,
  });
  const GRASS = on({ grip: 0.5, traction: 0.6, drag: 5 });
  const GRAVEL = on({ grip: 0.35, traction: 0.4, drag: 14 });
  const runOn = (car: CarState, input: InputCommand, seconds: number, surface: SurfaceEffect) => {
    for (let i = 0; i < Math.round(seconds * TICK_RATE); i++)
      car = stepCar(car, input, CAR_PARAMS, FIXED_DT, surface);
    return car;
  };

  it('is slower on grass than on asphalt', () => {
    const asphalt = runOn(createCar(), THROTTLE, 20, NEUTRAL_SURFACE_EFFECT);
    const grass = runOn(createCar(), THROTTLE, 20, GRASS);
    expect(length(grass.velocity)).toBeLessThan(length(asphalt.velocity) * 0.7);
  });

  it('gravel stops a coasting car sooner than grass', () => {
    const moving: CarState = { ...createCar(), velocity: scale(forward(0), 30) };
    const grass = runOn(moving, NEUTRAL_INPUT, 1.5, GRASS);
    const gravel = runOn(moving, NEUTRAL_INPUT, 1.5, GRAVEL);
    expect(length(gravel.velocity)).toBeLessThan(length(grass.velocity));
  });

  it('a spin kick rotates the car, then dies out', () => {
    const moving: CarState = { ...createCar(), velocity: scale(forward(0), 30) };
    const kicked = stepCar(moving, NEUTRAL_INPUT, CAR_PARAMS, FIXED_DT, on({ spinKick: 1 }));
    expect(kicked.spin).toBeGreaterThan(0);
    const later = run(kicked, NEUTRAL_INPUT, 3);
    expect(later.heading).toBeGreaterThan(0.1);
    expect(Math.abs(later.spin)).toBeLessThan(0.01);
  });
});

describe('stepCar — smoothness', () => {
  const SPEED = 30;
  const rolling: CarState = { ...createCar(), velocity: scale(forward(0), SPEED) };
  /** Steady-state yaw rate for full right lock at SPEED, as stepCar computes its target. */
  const steadyYaw =
    CAR_PARAMS.maxYawRate * (1 - (CAR_PARAMS.highSpeedSteerLoss * SPEED) / CAR_PARAMS.maxSpeed);
  const FULL_RIGHT: InputCommand = { ...THROTTLE, steer: 1 };

  it('yaw builds up progressively instead of jumping with the steering', () => {
    const lockedSteer: CarState = { ...rolling, steer: 1 };
    const oneTick = stepCar(lockedSteer, FULL_RIGHT, CAR_PARAMS, FIXED_DT);
    expect(Math.abs(oneTick.yawRate)).toBeLessThan(steadyYaw * 0.2);
    const halfSecond = run(lockedSteer, FULL_RIGHT, 0.5);
    expect(Math.abs(halfSecond.yawRate)).toBeGreaterThan(steadyYaw * 0.9);
  });

  it('yaw winds down progressively when the steering is released', () => {
    const turning = run(rolling, FULL_RIGHT, 1);
    const released = stepCar(turning, THROTTLE, CAR_PARAMS, FIXED_DT);
    expect(Math.abs(released.yawRate)).toBeGreaterThan(Math.abs(turning.yawRate) * 0.8);
    expect(Math.abs(run(turning, THROTTLE, 1.5).yawRate)).toBeLessThan(0.02);
  });
});
