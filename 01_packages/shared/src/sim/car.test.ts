import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { FIXED_DT, TICK_RATE } from '../config/sim';
import { dot, forward, length, right, scale } from '../math/vec2';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import { createCar, stepCar, type CarState } from './car';

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
      handbrake: false,
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
