import { describe, expect, it } from 'vitest';
import { steeringWheelAngle } from './CockpitView';

describe('steeringWheelAngle', () => {
  it('turns the wheel clockwise (negative) when steering right, a quarter turn at full lock', () => {
    expect(steeringWheelAngle(0)).toBe(-0);
    expect(steeringWheelAngle(1)).toBeCloseTo(-Math.PI / 2);
    expect(steeringWheelAngle(-0.5)).toBeCloseTo(Math.PI / 4);
  });
});
