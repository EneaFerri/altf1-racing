import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { FIXED_DT, TICK_RATE } from '../config/sim';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { dot, forward, scale, vec2 } from '../math/vec2';
import { NEUTRAL_INPUT } from '../types/input';
import { createCar, stepCar, type CarState } from './car';
import {
  NO_SLIPSTREAM,
  slipstreamEffect,
  slipstreamFactor,
  type SlipstreamEffect,
} from './slipstream';

const P = SLIPSTREAM_PARAMS;

/** A car at (x, z) facing -Z (heading 0) at `speed` m/s. */
function car(id: string, x: number, z: number, speed: number, heading = 0): CarState {
  return {
    ...createCar({ id, position: vec2(x, z), heading }),
    velocity: scale(forward(heading), speed),
  };
}

/** Follower `gap` metres behind a leader driving -Z at `speed`, `side` metres off its axis. */
function towOf(gap: number, speed = 70, side = 0, heading = 0): number {
  const leader = car('leader', 0, 0, speed);
  const follower = car('follower', side, gap, speed, heading);
  return slipstreamFactor(follower, [leader, follower], P);
}

describe('slipstreamFactor', () => {
  it('is full right behind a fast leader and fades to 0 at the end of the wake', () => {
    expect(towOf(P.fullGap)).toBe(1);
    expect(towOf((P.fullGap + P.range) / 2)).toBeCloseTo(0.5);
    expect(towOf(P.range)).toBe(0);
    expect(towOf(P.range + 10)).toBe(0);
  });

  it('is stronger the closer the car is', () => {
    expect(towOf(10)).toBeGreaterThan(towOf(20));
    expect(towOf(20)).toBeGreaterThan(towOf(30));
  });

  it('fades out to the side of the wake', () => {
    expect(towOf(P.fullGap, 70, P.halfWidth / 2)).toBeCloseTo(0.5);
    expect(towOf(P.fullGap, 70, P.halfWidth + 0.5)).toBe(0);
  });

  it('grows with the leader speed and does not exist below minSpeed', () => {
    expect(towOf(P.fullGap, P.minSpeed - 1)).toBe(0);
    const mid = towOf(P.fullGap, (P.minSpeed + P.fullSpeed) / 2);
    expect(mid).toBeCloseTo(0.5);
    expect(towOf(P.fullGap, P.fullSpeed)).toBe(1);
  });

  it('gives nothing in front of the leader or when pointing another way', () => {
    expect(towOf(-P.fullGap)).toBe(0);
    expect(towOf(P.fullGap, 70, 0, P.maxHeadingDiff + 0.1)).toBe(0);
  });

  it('takes the strongest wake when there are several leaders, and never its own', () => {
    const near = car('near', 0, 0, 70);
    const far = car('far', 0, -20, 70);
    const follower = car('follower', 0, 10, 70);
    expect(slipstreamFactor(follower, [far, near, follower], P)).toBe(
      slipstreamFactor(follower, [near, follower], P),
    );
    expect(slipstreamFactor(follower, [follower], P)).toBe(0);
  });
});

describe('slipstream effect on top speed', () => {
  /** Forward speed after `seconds` of full throttle from rest, towed by `slip` all the way. */
  function topSpeed(slip: SlipstreamEffect, seconds = 120): number {
    let c = createCar();
    const throttle = { ...NEUTRAL_INPUT, throttle: 1 };
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      c = stepCar(c, throttle, CAR_PARAMS, FIXED_DT, undefined, slip);
    }
    return dot(c.velocity, forward(c.heading));
  }

  it('changes nothing without a tow', () => {
    expect(slipstreamEffect(0, P)).toEqual(NO_SLIPSTREAM);
  });

  it('lifts the top speed from ~283 to ~320 km/h at full tow', () => {
    const alone = topSpeed(NO_SLIPSTREAM) * 3.6;
    const towed = topSpeed(slipstreamEffect(1, P)) * 3.6;
    expect(alone).toBeGreaterThan(278);
    expect(alone).toBeLessThan(288);
    expect(towed).toBeGreaterThan(312);
    expect(towed).toBeLessThan(328);
  });
});
