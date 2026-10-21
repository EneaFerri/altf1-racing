import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { FIXED_DT, TICK_RATE } from '../config/sim';
import { dot, forward, headingOf, length, right, scale } from '../math/vec2';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import { createCar, slipAngle, stepCar, type CarState } from './car';
import { NEUTRAL_SURFACE_EFFECT, type SurfaceEffect } from './surface';

const THROTTLE: InputCommand = { ...NEUTRAL_INPUT, throttle: 1 };
const BRAKE: InputCommand = { ...NEUTRAL_INPUT, brake: 1 };

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

  it('brakes to a stop, then reverses up to maxReverseSpeed', () => {
    const moving = run(createCar(), THROTTLE, 2);
    const stopped = run(moving, BRAKE, 1);
    expect(forwardSpeed(stopped)).toBeLessThanOrEqual(0);
    expect(forwardSpeed(run(stopped, BRAKE, 10))).toBeCloseTo(-CAR_PARAMS.maxReverseSpeed);
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
    const reversing = run(createCar(), BRAKE, 2);
    const turned = run(reversing, { ...BRAKE, steer: 1 }, 0.5);
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
      brake: tick % 200 >= 180 ? 1 : 0,
      steer: Math.sin(tick / 40) > 0 ? 1 : -1,
      handbrake: tick % 300 > 200,
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

describe('stepCar — drift', () => {
  const DRIFT_RIGHT: InputCommand = { ...THROTTLE, steer: 1, handbrake: true };
  const MAX_SLIP = CAR_PARAMS.driftAngle + CAR_PARAMS.driftAngleSteerRange;
  /** Car already rolling straight ahead at `speed` m/s. */
  const rolling = (speed: number): CarState => ({
    ...createCar(),
    velocity: scale(forward(0), speed),
  });

  it('starts with handbrake + steer above driftMinSpeed', () => {
    const car = stepCar(rolling(20), DRIFT_RIGHT, CAR_PARAMS, FIXED_DT);
    expect(car.drifting).toBe(true);
    expect(car.driftDirection).toBe(1);
  });

  it('does not start below driftMinSpeed', () => {
    const car = stepCar(rolling(CAR_PARAMS.driftMinSpeed - 2), DRIFT_RIGHT, CAR_PARAMS, FIXED_DT);
    expect(car.drifting).toBe(false);
  });

  it('keeps the slip angle bounded: no spin-out', () => {
    let car = rolling(30);
    let maxSlip = 0;
    for (let i = 0; i < 5 * TICK_RATE; i++) {
      car = stepCar(car, DRIFT_RIGHT, CAR_PARAMS, FIXED_DT);
      maxSlip = Math.max(maxSlip, Math.abs(slipAngle(car)));
    }
    expect(car.drifting).toBe(true);
    expect(maxSlip).toBeGreaterThan(CAR_PARAMS.driftAngle);
    expect(maxSlip).toBeLessThanOrEqual(MAX_SLIP + 1e-6);
  });

  it('countersteering gives a smaller slip angle than steering into the drift', () => {
    const entered = run(rolling(30), DRIFT_RIGHT, 0.2);
    const into = run(entered, DRIFT_RIGHT, 2);
    const counter = run(entered, { ...DRIFT_RIGHT, steer: -1 }, 2);
    expect(counter.drifting).toBe(true);
    expect(Math.abs(slipAngle(counter))).toBeLessThan(Math.abs(slipAngle(into)));
  });

  it('releasing the handbrake ends the drift and straightens the car', () => {
    const drifting = run(rolling(30), DRIFT_RIGHT, 2);
    const released = run(drifting, THROTTLE, 1.5);
    expect(released.drifting).toBe(false);
    expect(Math.abs(slipAngle(released))).toBeLessThan(0.05);
  });

  it('keeps most of its speed with throttle', () => {
    const drifting = run(rolling(30), DRIFT_RIGHT, 2);
    expect(length(drifting.velocity)).toBeGreaterThan(30 * 0.85);
  });

  it('keeps its speed when grip comes back after the drift', () => {
    const drifting = run(rolling(30), DRIFT_RIGHT, 2);
    const released = run(drifting, THROTTLE, 1);
    expect(length(released.velocity)).toBeGreaterThanOrEqual(length(drifting.velocity) * 0.95);
  });

  it('turns tighter than grip driving at high speed', () => {
    const fast = rolling(150 / 3.6);
    const grip = run(fast, { ...THROTTLE, steer: 1 }, 1);
    const drift = run(fast, DRIFT_RIGHT, 1);
    const travelChange = (car: CarState): number => Math.abs(headingOf(car.velocity));
    expect(travelChange(drift)).toBeGreaterThan(travelChange(grip));
  });

  it('ends when braking below driftExitSpeed', () => {
    const drifting = run(rolling(20), DRIFT_RIGHT, 0.5);
    const braked = run(drifting, { ...BRAKE, steer: 1, handbrake: true }, 3);
    expect(braked.drifting).toBe(false);
  });

  it('handbrake without steering just slows the car', () => {
    const car = run(rolling(20), { ...NEUTRAL_INPUT, handbrake: true }, 1);
    expect(car.drifting).toBe(false);
    expect(length(car.velocity)).toBeLessThan(20 - CAR_PARAMS.handbrakeDecel * 0.9);
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

  it('a bump prevents drifting', () => {
    const moving: CarState = { ...createCar(), velocity: scale(forward(0), 30) };
    const car = stepCar(
      moving,
      { ...THROTTLE, steer: 1, handbrake: true },
      CAR_PARAMS,
      FIXED_DT,
      on({ breaksDrift: true }),
    );
    expect(car.drifting).toBe(false);
  });
});
