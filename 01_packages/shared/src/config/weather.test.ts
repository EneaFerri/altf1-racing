import { describe, expect, it } from 'vitest';
import { DRY_FORECAST, everWet, offersRain, RAIN_FORECAST, wetnessAt } from './weather';

describe('offersRain', () => {
  it('offers the rain on São Paulo only, for now', () => {
    expect(offersRain('São Paulo')).toBe(true);
    for (const track of ['Monza', 'Monaco', 'Singapore', 'Las Vegas', 'Test Ring']) {
      expect(offersRain(track)).toBe(false);
    }
  });
});

describe('wetnessAt (2.8)', () => {
  const forecast = [
    { tick: 100, wetness: 0 },
    { tick: 300, wetness: 0.8 },
  ];

  it('holds the first wetness before it and the last after it', () => {
    expect(wetnessAt(forecast, 0)).toBe(0);
    expect(wetnessAt(forecast, 100)).toBe(0);
    expect(wetnessAt(forecast, 300)).toBe(0.8);
    expect(wetnessAt(forecast, 10_000)).toBe(0.8);
  });

  it('turns linearly in between', () => {
    expect(wetnessAt(forecast, 200)).toBeCloseTo(0.4, 12);
    expect(wetnessAt(forecast, 150)).toBeCloseTo(0.2, 12);
  });

  it('reads the constant forecasts of a dry and a rainy GP', () => {
    expect(wetnessAt(DRY_FORECAST, 5000)).toBe(0);
    expect(wetnessAt(RAIN_FORECAST, 5000)).toBe(1);
    expect(everWet(DRY_FORECAST)).toBe(false);
    expect(everWet(forecast)).toBe(true);
  });
});
