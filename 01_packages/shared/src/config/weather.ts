/**
 * The weather a race is run in (01_docs/weather.md). Dry everywhere unless chosen otherwise;
 * `variable` (2.8): it starts dry or wet and turns during the race (`Forecast`).
 */
export const WEATHERS = ['dry', 'rain', 'variable'] as const;
export type Weather = (typeof WEATHERS)[number];

/**
 * How wet the track is over time (2.8): wetness (0 dry … 1 soaked) at given ticks of the
 * simulation, in order; linear in between, the first before it, the last after it
 * (`wetnessAt`). Plain data: the server sends it, every machine reads the same wetness.
 */
export type Forecast = readonly ForecastPoint[];

export interface ForecastPoint {
  readonly tick: number;
  readonly wetness: number;
}

/** Wetness 0 or 1 all along: a dry or a rainy GP. */
export const DRY_FORECAST: Forecast = [{ tick: 0, wetness: 0 }];
export const RAIN_FORECAST: Forecast = [{ tick: 0, wetness: 1 }];

/** `forecast`'s wetness at `tick`. */
export function wetnessAt(forecast: Forecast, tick: number): number {
  const first = forecast[0];
  if (!first || tick <= first.tick) return first?.wetness ?? 0;
  for (let i = 1; i < forecast.length; i++) {
    const b = forecast[i]!;
    if (tick >= b.tick) continue;
    const a = forecast[i - 1]!;
    return a.wetness + ((b.wetness - a.wetness) * (tick - a.tick)) / (b.tick - a.tick);
  }
  return forecast[forecast.length - 1]!.wetness;
}

/** Whether the track is ever wet under `forecast`. */
export function everWet(forecast: Forecast): boolean {
  return forecast.some((point) => point.wetness > 0);
}

/** A variable GP's weather (2.8, `variableForecast`): when and how fast it turns, how wet. */
export interface ForecastParams {
  /** Wetness of a wet spell: least and most. */
  readonly wetness: readonly [number, number];
  /** The turn begins after this share of the race distance: earliest and latest. */
  readonly turnAt: readonly [number, number];
  /** Laps the turn takes (from one wetness to the other): fewest and most. */
  readonly turnLaps: readonly [number, number];
  /** A lap's length in ticks is reckoned at this speed (m/s): only when the weather turns. */
  readonly lapSpeed: number;
}

/** Provisional (2.8), see 01_docs/weather.md. */
export const FORECAST_PARAMS: ForecastParams = {
  wetness: [0.55, 1],
  turnAt: [0.2, 0.55],
  turnLaps: [1, 2],
  lapSpeed: 45,
};

/**
 * The circuits whose Grand Prix manager may choose the rain (2.7: São Paulo first). Every other
 * track is always dry. Add a track's name here to offer it there too.
 */
export const RAIN_TRACKS: readonly string[] = ['São Paulo'];

/** Whether the Grand Prix on `track` (its name) may be run in the rain. */
export function offersRain(track: string): boolean {
  return RAIN_TRACKS.includes(track);
}

/**
 * How a wet track drives (01_docs/weather.md): a little less grip and braking everywhere, much
 * less in a puddle. Multipliers of the surface's own effect, so wet grass is worse than wet asphalt.
 */
export interface WetParams {
  /** Multiplies lateral grip on a wet track: the car slides wider in corners. */
  grip: number;
  /** Multiplies engine thrust and braking (wet tyres). */
  traction: number;
  /** Multiplies braking only, on top of `traction`. */
  brake: number;
  /** A wheel in a puddle: multiplies grip, then traction, adds drag (m/s², all four wheels in it). */
  puddleGrip: number;
  puddleTraction: number;
  puddleDrag: number;
}

/** The owner's values (F2, 2026-11-18), see 01_docs/weather.md. */
export const WET_PARAMS: WetParams = {
  grip: 0.3,
  traction: 0.95,
  brake: 0.59,
  puddleGrip: 0.1,
  puddleTraction: 0.3,
  puddleDrag: 2.3,
};

/** Where the puddles of a wet track lie: placed once per track (`placePuddles`), the same everywhere. */
export interface PuddleParams {
  /** One candidate spot every this many metres along the track. */
  step: number;
  /** Chance of a puddle at a candidate spot on a straight. */
  baseChance: number;
  /** Extra chance per unit of curvature (1/m) nearby: puddles gather round the corners. */
  bendChance: number;
  /** Highest chance at a spot. */
  maxChance: number;
  /** How far before and after a spot its corner is looked for (m). */
  bendWindow: number;
  /** Half the puddle's length along the track (m): smallest and largest. */
  halfLength: readonly [number, number];
  /** Half the puddle's width across the track (m): smallest and largest. */
  halfWidth: readonly [number, number];
  /** Space kept between a puddle and the kerb band (m): a puddle always lies on the asphalt. */
  edgeClearance: number;
  /** No puddle within this many metres before the start line (the grid: 20 slots, 8 m apart). */
  gridBack: number;
  /** No puddle within this many metres after the start line. */
  gridAhead: number;
}

/** Provisional (step W.1), see 01_docs/weather.md. */
export const PUDDLE_PARAMS: PuddleParams = {
  step: 40,
  baseChance: 0.1,
  bendChance: 25,
  maxChance: 0.6,
  bendWindow: 50,
  halfLength: [1.5, 3.5],
  halfWidth: [0.8, 1.8],
  edgeClearance: 0.6,
  gridBack: 190,
  gridAhead: 30,
};
