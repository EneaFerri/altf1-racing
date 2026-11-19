import { describe, expect, it } from 'vitest';
import {
  damageLevel,
  formatDelta,
  formatLapTime,
  gpBestColor,
  gpSectorColor,
  sectorColor,
  slipstreamPercent,
} from './format';

describe('slipstreamPercent', () => {
  it('rounds the tow to a whole percentage, clamped to 0..100', () => {
    expect(slipstreamPercent(0)).toBe(0);
    expect(slipstreamPercent(0.424)).toBe(42);
    expect(slipstreamPercent(1)).toBe(100);
    expect(slipstreamPercent(1.2)).toBe(100);
  });
});

describe('formatLapTime', () => {
  it('formats ticks (60 Hz) as m:ss.mmm, without minutes under one minute', () => {
    expect(formatLapTime(60 * 83 + 27)).toBe('1:23.450');
    expect(formatLapTime(60 * 23)).toBe('23.000');
    expect(formatLapTime(60 * 65)).toBe('1:05.000');
  });

  it('shows tenths for the running time, never rounding up', () => {
    expect(formatLapTime(60 * 83 + 59, 1)).toBe('1:23.9');
    expect(formatLapTime(60 * 5, 1)).toBe('5.0');
  });
});

describe('formatDelta', () => {
  it('signs the gap in seconds', () => {
    expect(formatDelta(12)).toBe('+0.200');
    expect(formatDelta(-6)).toBe('−0.100');
    expect(formatDelta(0)).toBe('+0.000');
  });
});

describe('sectorColor', () => {
  it('purple for a record (or the first time), green if faster than the best lap, else yellow', () => {
    expect(sectorColor(100, null, null)).toBe('purple');
    expect(sectorColor(90, 95, 110)).toBe('purple');
    expect(sectorColor(100, 95, 110)).toBe('green');
    expect(sectorColor(120, 95, 110)).toBe('yellow');
    expect(sectorColor(110, 95, 110)).toBe('yellow');
  });
});

describe('damageLevel', () => {
  it('goes ok → light → heavy → critical as a part gets more damaged', () => {
    expect([0, 0.09, 0.1, 0.39, 0.4, 0.74, 0.75, 1].map(damageLevel)).toEqual([
      'ok',
      'ok',
      'light',
      'light',
      'heavy',
      'heavy',
      'critical',
      'critical',
    ]);
  });
});

describe('gpSectorColor', () => {
  it("purple for the session's best of everyone, green for an own best, else yellow", () => {
    expect(gpSectorColor(100, null, null)).toBe('purple'); // nobody timed yet
    expect(gpSectorColor(90, 95, 92)).toBe('purple');
    expect(gpSectorColor(92, 95, 92)).toBe('purple'); // it is the session's best (set by it)
    expect(gpSectorColor(93, 95, 92)).toBe('green'); // own best, someone else faster
    expect(gpSectorColor(93, null, 92)).toBe('green'); // own first time
    expect(gpSectorColor(96, 95, 92)).toBe('yellow');
    expect(gpSectorColor(95, 95, 92)).toBe('yellow');
  });
});

describe('gpBestColor', () => {
  it("purple while the own best is the session's best, green once beaten", () => {
    expect(gpBestColor(92, null)).toBe('purple');
    expect(gpBestColor(92, 92)).toBe('purple');
    expect(gpBestColor(93, 92)).toBe('green');
  });
});
