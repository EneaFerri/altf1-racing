import { describe, expect, it } from 'vitest';
import { formatDelta, formatLapTime, sectorColor } from './format';

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
