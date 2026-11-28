import { TICK_RATE } from '../config/sim';
import {
  DRY_FORECAST,
  FORECAST_PARAMS,
  RAIN_FORECAST,
  type Forecast,
  type ForecastParams,
  type Weather,
} from '../config/weather';

/**
 * A variable GP's weather (2.8, 01_docs/weather.md): the wetness it starts at and the one it turns
 * to during the race. One of them is 0: it starts dry and rain comes, or it starts wet and dries.
 */
export interface WeatherTurn {
  readonly from: number;
  readonly to: number;
}

/** A variable GP's turn of weather, drawn (`random` in [0, 1)) when the manager chooses it. */
export function drawWeatherTurn(
  random: () => number,
  p: ForecastParams = FORECAST_PARAMS,
): WeatherTurn {
  const startsWet = random() < 0.5;
  const wet = between(p.wetness, random());
  return startsWet ? { from: wet, to: 0 } : { from: 0, to: wet };
}

/** The weather until the race starts: dry, soaked, or a variable GP's starting wetness. */
export function forecastBefore(weather: Weather, turn: WeatherTurn | null): Forecast {
  if (weather === 'rain') return RAIN_FORECAST;
  if (weather === 'variable' && turn) return [{ tick: 0, wetness: turn.from }];
  return DRY_FORECAST;
}

/**
 * A variable GP's race (from tick `start`, `laps` laps of `lapLength` m): `turn.from` until the
 * weather turns, a random share of the distance in (`turnAt`), then `turn.to` reached in `turnLaps`
 * laps (reckoned at `lapSpeed`).
 */
export function raceForecast(
  turn: WeatherTurn,
  start: number,
  laps: number,
  lapLength: number,
  random: () => number,
  p: ForecastParams = FORECAST_PARAMS,
): Forecast {
  const lapTicks = (lapLength / p.lapSpeed) * TICK_RATE;
  const begins = start + Math.round(laps * lapTicks * between(p.turnAt, random()));
  const ends = begins + Math.max(1, Math.round(lapTicks * between(p.turnLaps, random())));
  return [
    { tick: begins, wetness: turn.from },
    { tick: ends, wetness: turn.to },
  ];
}

function between([min, max]: readonly [number, number], t: number): number {
  return min + (max - min) * t;
}
