import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from '../sim/game';
import { buildTrack } from '../track/buildTrack';
import { TEST_TRACK } from '../track/layouts/testTrack';
import { NEUTRAL_INPUT } from '../types/input';
import { onlineSimContext } from './simContext';
import { quantizeState } from './quantize';

const ctx = onlineSimContext(buildTrack(TEST_TRACK));

function driven(ticks: number) {
  let state = createGame(ctx.track, ['p1', 'p2']);
  const inputs = {
    p1: { ...NEUTRAL_INPUT, throttle: 1, steer: 0.3 },
    p2: { ...NEUTRAL_INPUT, throttle: 0.7 },
  };
  for (let i = 0; i < ticks; i++) state = stepGame(state, inputs, ctx);
  return state;
}

describe('quantizeState', () => {
  it('rounds every fractional number to 4 decimals and keeps whole ones', () => {
    const state = quantizeState(driven(90));
    const car = state.cars[0]!;
    for (const n of [car.position.x, car.position.z, car.velocity.x, car.heading, car.steer]) {
      expect(Math.round(n * 1e4) / 1e4).toBe(n);
    }
    expect(state.tick).toBe(90);
    expect(state.laps[0]!.lapStartTick).toBe(driven(90).laps[0]!.lapStartTick);
  });

  it('changes nothing visible and nothing when applied twice', () => {
    const exact = driven(90);
    const once = quantizeState(exact);
    expect(Math.abs(once.cars[0]!.position.x - exact.cars[0]!.position.x)).toBeLessThanOrEqual(
      5e-5,
    );
    expect(quantizeState(once)).toEqual(once);
  });

  it('survives the trip through JSON unchanged, so client and server go on from the same numbers', () => {
    const state = quantizeState(driven(90));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
