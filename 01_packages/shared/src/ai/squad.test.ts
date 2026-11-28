import { describe, expect, it } from 'vitest';
import { BOT_TYRE_SWITCH as S } from '../config/bot';
import { TYRE_PARAMS, weatherCompound } from '../config/tyres';
import { RAIN_FORECAST, WET_PARAMS } from '../config/weather';
import { planWet, wrongTyres } from './squad';

const rain = { params: WET_PARAMS, puddles: [], forecast: RAIN_FORECAST };

describe('the bots’ tyres in changing weather (2.8)', () => {
  it('pits slicks in the rain, intermediates when soaked or dry, full wets on a drying track', () => {
    expect(wrongTyres('medium', S.slickAbove - 0.01)).toBe(false);
    expect(wrongTyres('soft', S.slickAbove + 0.01)).toBe(true);
    expect(wrongTyres('intermediate', 0.5)).toBe(false);
    expect(wrongTyres('intermediate', S.intermediateAbove + 0.01)).toBe(true);
    expect(wrongTyres('intermediate', S.intermediateBelow - 0.01)).toBe(true);
    expect(wrongTyres('wet', 0.8)).toBe(false);
    expect(wrongTyres('wet', S.wetBelow - 0.01)).toBe(true);
  });

  it('never fits tyres it would pit for straight away', () => {
    for (let w = 0; w <= 1; w += 0.01) {
      expect(wrongTyres(weatherCompound(w, TYRE_PARAMS), w)).toBe(false);
    }
  });

  it('plans for the next quarter of wetness up, on its own compound', () => {
    expect(planWet('medium', 0, undefined, TYRE_PARAMS)).toEqual({ key: 'dry', wet: undefined });
    const wets = planWet('wet', 0.9, rain, TYRE_PARAMS);
    expect(wets.key).toBe('wet:1');
    expect(wets.wet!.grip).toBeCloseTo(TYRE_PARAMS.wet.wet.grip[2] * TYRE_PARAMS.grip.wet, 12);
    expect(planWet('soft', 0.3, rain, TYRE_PARAMS).key).toBe('slick:0.5');
    // No compounds (outside the Grand Prix): the rain's own params.
    expect(planWet('medium', 1, rain, undefined)).toEqual({ key: 'rain', wet: WET_PARAMS });
  });
});
