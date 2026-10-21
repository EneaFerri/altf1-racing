import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '@altf1/shared';
import { GameLoop, MAX_FRAME_SECONDS } from './GameLoop';

function createLoop() {
  const calls = { ticks: 0, alphas: [] as number[] };
  const loop = new GameLoop({
    tick: () => calls.ticks++,
    render: (alpha) => calls.alphas.push(alpha),
  });
  return { loop, calls };
}

describe('GameLoop.advance', () => {
  it('runs one tick per fixed step at 60 Hz', () => {
    const { loop, calls } = createLoop();
    for (let i = 0; i < 60; i++) loop.advance(FIXED_DT);
    expect(calls.ticks).toBe(60);
  });

  it('keeps 60 ticks per second on a 144 Hz display', () => {
    const { loop, calls } = createLoop();
    for (let i = 0; i < 144; i++) loop.advance(1 / 144);
    expect(calls.ticks).toBe(60);
  });

  it('runs several ticks in one slow frame', () => {
    const { loop } = createLoop();
    expect(loop.advance(FIXED_DT * 3)).toBe(3);
  });

  it('clamps huge frames to avoid the spiral of death', () => {
    const { loop } = createLoop();
    expect(loop.advance(10)).toBe(Math.round(MAX_FRAME_SECONDS / FIXED_DT));
  });

  it('renders every frame with the leftover fraction as alpha', () => {
    const { loop, calls } = createLoop();
    loop.advance(FIXED_DT / 2);
    expect(calls.ticks).toBe(0);
    expect(calls.alphas[0]).toBeCloseTo(0.5);
  });

  it('passes the clamped frame time to render', () => {
    const frames: number[] = [];
    const loop = new GameLoop({
      tick: () => {},
      render: (_alpha, seconds) => frames.push(seconds),
    });
    loop.advance(10);
    expect(frames[0]).toBe(MAX_FRAME_SECONDS);
  });

  it('ignores negative frame times', () => {
    const { loop } = createLoop();
    expect(loop.advance(-1)).toBe(0);
  });
});
