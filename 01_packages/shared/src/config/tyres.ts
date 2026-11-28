/**
 * Tyre compounds (T.1 and T.2, the Grand Prix only; 01_docs/tyres.md). Every car starts on
 * mediums, or on the tyres the weather asks for (`weatherCompound`); at a pit stop its driver fits
 * softs, mediums, intermediates or full wets (keys 1 / 2 / 3 / 4). Softs grip and pull out of
 * corners better but wear out sooner; worn tyres lose some of both. On a wet track each compound
 * grips by its own curve (`wet`): slicks barely stay on the road in the rain, intermediates are the
 * tyre for a damp track, full wets for a soaked one. Provisional until the owner's test.
 */
export const TYRE_COMPOUNDS = ['soft', 'medium', 'intermediate', 'wet'] as const;
export type TyreCompound = (typeof TYRE_COMPOUNDS)[number];

/** A value at wetness 0 (dry), 0.5 and 1 (soaked); in between, linearly (`atWetness`). */
export type WetCurve = readonly [number, number, number];

/** How a compound copes with a wet track: multipliers of the dry surface's effect. */
export interface WetTyre {
  /** Lateral grip. */
  readonly grip: WetCurve;
  /** Engine thrust and braking. */
  readonly traction: WetCurve;
  /** Braking only, on top of `traction`. */
  readonly brake: WetCurve;
  /** A wheel in a puddle on a soaked track: grip and traction (aquaplaning); less wet, less. */
  readonly puddleGrip: number;
  readonly puddleTraction: number;
  /**
   * Power oversteer (2.8, `slideFrom`): the cornering load (m/s², speed × turn rate) above which
   * the throttle breaks the rear loose, at wetness 0.5 and 1; a drier track holds more (none dry).
   */
  readonly slideFrom: readonly [number, number];
}

export interface TyreParams {
  /**
   * Multiplier of the car's grip (`lateralGrip`) and turning (`maxYawRate`: faster through the
   * bends) on new tyres of each compound, on a dry track.
   */
  grip: Readonly<Record<TyreCompound, number>>;
  /** Multiplier of the car's acceleration (`engineAccel`: out of the bends) on new tyres. */
  traction: Readonly<Record<TyreCompound, number>>;
  /** Laps (of the circuit's length) in which a set wears from new to fully worn. */
  lifeLaps: Readonly<Record<TyreCompound, number>>;
  /** Share of grip, turning and traction a fully worn set has lost; less wear, proportionally less. */
  wornLoss: number;
  /** Each compound on a wet track (T.2). */
  wet: Readonly<Record<TyreCompound, WetTyre>>;
  /**
   * How much faster a compound wears on a dry track (rain tyres overheat): × this at wetness 0,
   * easing to × 1 at `cooledAt`.
   */
  dryWear: Readonly<Record<TyreCompound, number>>;
  /** Wetness from which rain tyres no longer overheat. */
  cooledAt: number;
  /**
   * How fast a car on the throttle past `slideFrom` turns itself round (1/s, of the excess turn
   * rate): above `spinDamping` (4) the slide feeds itself into a spin unless the driver lifts.
   */
  slideGain: number;
  /** A slide spins the car round no faster than this (rad/s): a real spin, not a top. */
  slideMaxSpin: number;
  /** The tyre the weather asks for (`weatherCompound`): intermediates from this wetness… */
  intermediateFrom: number;
  /** …full wets from this one. */
  wetFrom: number;
}

const SLICK_IN_WET: WetTyre = {
  grip: [1, 0.45, 0.22],
  traction: [1, 0.75, 0.55],
  brake: [1, 0.6, 0.45],
  puddleGrip: 0.1,
  puddleTraction: 0.3,
  slideFrom: [50, 30],
};

export const TYRE_PARAMS: TyreParams = {
  grip: { soft: 1.05, medium: 1, intermediate: 0.93, wet: 0.86 },
  traction: { soft: 1.05, medium: 1, intermediate: 0.97, wet: 0.94 },
  lifeLaps: { soft: 4, medium: 9, intermediate: 7, wet: 8 },
  wornLoss: 0.1,
  wet: {
    soft: SLICK_IN_WET,
    medium: SLICK_IN_WET,
    intermediate: {
      grip: [1, 0.86, 0.66],
      traction: [1, 0.95, 0.85],
      brake: [1, 0.9, 0.78],
      puddleGrip: 0.45,
      puddleTraction: 0.6,
      slideFrom: [75, 50],
    },
    wet: {
      grip: [1, 0.92, 0.8],
      traction: [1, 0.97, 0.92],
      brake: [1, 0.93, 0.85],
      puddleGrip: 0.7,
      puddleTraction: 0.8,
      slideFrom: [80, 60],
    },
  },
  dryWear: { soft: 1, medium: 1, intermediate: 3, wet: 4 },
  cooledAt: 0.5,
  slideGain: 7,
  slideMaxSpin: 3.5,
  intermediateFrom: 0.15,
  wetFrom: 0.6,
};

/** `curve` at `wetness` (0…1). */
export function atWetness(curve: WetCurve, wetness: number): number {
  const [dry, half, soaked] = curve;
  return wetness <= 0.5
    ? dry + (half - dry) * (wetness / 0.5)
    : half + (soaked - half) * ((wetness - 0.5) / 0.5);
}

/**
 * The cornering load (m/s²) above which the throttle breaks `compound`'s rear loose on a track
 * `wetness` wet (`WetTyre.slideFrom`): none when dry, very high when barely damp, its own curve
 * from 0.5 on.
 */
export function slideFrom(compound: TyreCompound, wetness: number, p: TyreParams): number {
  if (wetness <= 0) return Infinity;
  const [half, soaked] = p.wet[compound].slideFrom;
  return wetness <= 0.5 ? half * (0.5 / wetness) : half + (soaked - half) * ((wetness - 0.5) / 0.5);
}

/** The tyre for a track this wet: mediums when (nearly) dry, then intermediates, then full wets. */
export function weatherCompound(wetness: number, p: TyreParams = TYRE_PARAMS): TyreCompound {
  if (wetness >= p.wetFrom) return 'wet';
  return wetness >= p.intermediateFrom ? 'intermediate' : 'medium';
}

/** Whether `compound` is a dry-weather (slick) tyre. */
export function isSlick(compound: TyreCompound): boolean {
  return compound === 'soft' || compound === 'medium';
}
