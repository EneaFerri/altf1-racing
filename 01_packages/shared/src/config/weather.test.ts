import { describe, expect, it } from 'vitest';
import { offersRain } from './weather';

describe('offersRain', () => {
  it('offers the rain on São Paulo only, for now', () => {
    expect(offersRain('São Paulo')).toBe(true);
    for (const track of ['Monza', 'Monaco', 'Singapore', 'Las Vegas', 'Test Ring']) {
      expect(offersRain(track)).toBe(false);
    }
  });
});
