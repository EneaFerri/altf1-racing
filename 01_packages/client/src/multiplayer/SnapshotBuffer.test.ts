import { describe, expect, it } from 'vitest';
import { FIXED_DT, type GameState } from '@altf1/shared';
import { DELAY_TICKS, SnapshotBuffer } from './SnapshotBuffer';

const snapshot = (tick: number): GameState => ({ tick, cars: [], impacts: [], laps: [] });

/** A buffer fed with snapshots every 2 ticks up to `last`, its clock settled. */
function settled(last: number): SnapshotBuffer {
  const buffer = new SnapshotBuffer();
  for (let tick = 2; tick <= last; tick += 2) buffer.push(snapshot(tick));
  buffer.advance(0);
  return buffer;
}

describe('SnapshotBuffer', () => {
  it('has nothing to draw before the first snapshot', () => {
    const buffer = new SnapshotBuffer();
    buffer.advance(1);
    expect(buffer.sample()).toBeNull();
  });

  it('starts the render clock DELAY_TICKS behind the newest snapshot', () => {
    const buffer = settled(20);
    expect(buffer.renderTick).toBe(20 - DELAY_TICKS);
    expect(buffer.sample()).toEqual({ prev: snapshot(16), curr: snapshot(18), alpha: 0 });
  });

  it('interpolates between the two snapshots around the clock', () => {
    const buffer = settled(20);
    buffer.advance(FIXED_DT); // clock 17: halfway from 16 to 18
    const sample = buffer.sample()!;
    expect(sample.prev.tick).toBe(16);
    expect(sample.curr.tick).toBe(18);
    expect(sample.alpha).toBeCloseTo(0.5, 1);
  });

  it('runs at real time and settles behind a steady stream', () => {
    const buffer = settled(20);
    for (let tick = 22; tick <= 400; tick += 2) {
      buffer.push(snapshot(tick));
      buffer.advance(2 * FIXED_DT);
    }
    expect(buffer.renderTick!).toBeCloseTo(400 - DELAY_TICKS, 0);
  });

  it('holds the newest snapshot when the stream stops (no extrapolation)', () => {
    const buffer = settled(20);
    buffer.advance(0.3); // 18 ticks with no new snapshot
    expect(buffer.sample()).toEqual({ prev: snapshot(20), curr: snapshot(20), alpha: 0 });
  });

  it('jumps instead of easing after a long gap (e.g. a hidden tab)', () => {
    const buffer = settled(20);
    buffer.push(snapshot(500));
    buffer.advance(FIXED_DT);
    expect(buffer.renderTick).toBe(500 - DELAY_TICKS);
  });

  it('ignores old and repeated ticks and keeps a bounded history', () => {
    const buffer = settled(20);
    buffer.push(snapshot(20));
    buffer.push(snapshot(10));
    buffer.advance(0);
    expect(buffer.sample()!.prev.tick).toBe(16);
    const long = settled(400);
    long.advance(-100); // clock far before the oldest kept snapshot
    expect(long.sample()!.prev.tick).toBeGreaterThan(300);
  });
});
