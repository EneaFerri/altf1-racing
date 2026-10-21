import { describe, expect, it } from 'vitest';
import { SURFACE_PARAMS } from '../config/surfaces';
import type { Surface } from '../track/types';
import { surfaceEffect } from './surface';

const ASPHALT: Surface[] = ['asphalt', 'asphalt', 'asphalt', 'asphalt'];

describe('surfaceEffect', () => {
  it('is neutral on asphalt', () => {
    expect(surfaceEffect(ASPHALT, ASPHALT, 30, SURFACE_PARAMS)).toMatchObject({
      grip: 1,
      traction: 1,
      drag: 0,
      spinKick: 0,
    });
  });

  it('averages the wheels: two wheels on grass = half the grass effect', () => {
    const effect = surfaceEffect(
      ASPHALT,
      ['grass', 'asphalt', 'grass', 'asphalt'],
      30,
      SURFACE_PARAMS,
    );
    expect(effect.grip).toBeCloseTo((1 + SURFACE_PARAMS.grass.grip) / 2);
    expect(effect.drag).toBeCloseTo(SURFACE_PARAMS.grass.drag / 2);
  });

  it('kicks the car when a wheel climbs a high kerb, and only then', () => {
    const climbing = surfaceEffect(
      ASPHALT,
      ['highKerb', 'asphalt', 'asphalt', 'asphalt'],
      30,
      SURFACE_PARAMS,
    );
    expect(climbing.spinKick).toBeLessThan(0); // left wheel → nose kicked right
    expect(climbing.breaksDrift).toBe(true);

    const staying = surfaceEffect(
      ['highKerb', 'asphalt', 'asphalt', 'asphalt'],
      ['highKerb', 'asphalt', 'asphalt', 'asphalt'],
      30,
      SURFACE_PARAMS,
    );
    expect(staying.spinKick).toBe(0);
  });

  it('low kerbs never kick', () => {
    expect(
      surfaceEffect(ASPHALT, ['kerb', 'kerb', 'kerb', 'kerb'], 30, SURFACE_PARAMS).spinKick,
    ).toBe(0);
  });
});
