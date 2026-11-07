import { describe, expect, it } from 'vitest';
import { NetSim, netSimFromEnv } from './netSim.ts';

const NO_STALL = { delayMs: 0, jitterMs: 0, stallMs: 0, stallEveryMs: 1000 };

describe('netSim', () => {
  it('is off unless a delay, jitter or stall is set', () => {
    expect(netSimFromEnv({})).toBeNull();
    expect(netSimFromEnv({ NET_DELAY_MS: 'abc' })).toBeNull();
    expect(netSimFromEnv({ NET_JITTER_MS: '40' })).toEqual({
      delayMs: 0,
      jitterMs: 40,
      stallMs: 0,
      stallEveryMs: 3000,
    });
  });

  it('adds the delay and up to the jitter', () => {
    const sim = new NetSim({ ...NO_STALL, delayMs: 80, jitterMs: 40 }, () => 0.5);
    expect(sim.deliveryTime(1000)).toBe(1100);
  });

  it('keeps the order: a message never overtakes an earlier one', () => {
    const randoms = [1, 0];
    const sim = new NetSim({ ...NO_STALL, jitterMs: 100 }, () => randoms.shift()!);
    expect(sim.deliveryTime(0)).toBe(100);
    expect(sim.deliveryTime(10)).toBe(100); // would be 10
  });

  it('holds every message of a stall back until it ends, then delivers them at once', () => {
    // First stall starts at 0 + 1000 × (0.5 + 0.5) = 1000 and lasts 250 ms.
    const sim = new NetSim(
      { delayMs: 50, jitterMs: 0, stallMs: 250, stallEveryMs: 1000 },
      () => 0.5,
    );
    expect(sim.deliveryTime(0)).toBe(50);
    expect(sim.deliveryTime(1000)).toBe(1300);
    expect(sim.deliveryTime(1200)).toBe(1300);
    expect(sim.deliveryTime(1260)).toBe(1310);
  });
});
