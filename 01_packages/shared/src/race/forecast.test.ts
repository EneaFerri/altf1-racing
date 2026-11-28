import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../config/sim';
import { DRY_FORECAST, FORECAST_PARAMS as P, RAIN_FORECAST, wetnessAt } from '../config/weather';
import { drawWeatherTurn, forecastBefore, raceForecast } from './forecast';

/** A `random` handing out `values` in turn. */
const draws = (...values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('a variable GP’s weather (2.8)', () => {
  it('draws a dry start turning wet, or a wet start drying out', () => {
    expect(drawWeatherTurn(draws(0.9, 0))).toEqual({ from: 0, to: P.wetness[0] });
    expect(drawWeatherTurn(draws(0.1, 1))).toEqual({ from: P.wetness[1], to: 0 });
  });

  it('holds the starting wetness until the race', () => {
    expect(forecastBefore('dry', null)).toBe(DRY_FORECAST);
    expect(forecastBefore('rain', null)).toBe(RAIN_FORECAST);
    expect(forecastBefore('variable', { from: 0.7, to: 0 })).toEqual([{ tick: 0, wetness: 0.7 }]);
  });

  it('turns during the race, within its share of the distance, over its laps', () => {
    const start = 10_000;
    const laps = 10;
    const lapLength = 4500;
    const forecast = raceForecast({ from: 0, to: 0.8 }, start, laps, lapLength, draws(0, 1));
    const lapTicks = (lapLength / P.lapSpeed) * TICK_RATE;
    expect(forecast[0]!.tick).toBe(start + Math.round(laps * lapTicks * P.turnAt[0]));
    expect(forecast[1]!.tick - forecast[0]!.tick).toBe(Math.round(lapTicks * P.turnLaps[1]));
    expect(wetnessAt(forecast, start)).toBe(0);
    expect(wetnessAt(forecast, forecast[1]!.tick)).toBe(0.8);
  });
});
