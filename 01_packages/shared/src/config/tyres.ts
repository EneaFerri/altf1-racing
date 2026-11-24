/**
 * Tyre compounds (T.1, the Grand Prix only; 01_docs/tyres.md). Every car starts on mediums; at a
 * pit stop its driver fits softs or mediums (keys 1 / 2). Softs grip and pull out of corners
 * better but wear out sooner; worn tyres lose some of both. Provisional until the owner's test.
 */
export const TYRE_COMPOUNDS = ['soft', 'medium'] as const;
export type TyreCompound = (typeof TYRE_COMPOUNDS)[number];

export interface TyreParams {
  /**
   * Multiplier of the car's grip (`lateralGrip`) and turning (`maxYawRate`: faster through the
   * bends) on new tyres of each compound.
   */
  grip: Readonly<Record<TyreCompound, number>>;
  /** Multiplier of the car's acceleration (`engineAccel`: out of the bends) on new tyres. */
  traction: Readonly<Record<TyreCompound, number>>;
  /** Laps (of the circuit's length) in which a set wears from new to fully worn. */
  lifeLaps: Readonly<Record<TyreCompound, number>>;
  /** Share of grip, turning and traction a fully worn set has lost; less wear, proportionally less. */
  wornLoss: number;
}

export const TYRE_PARAMS: TyreParams = {
  grip: { soft: 1.05, medium: 1 },
  traction: { soft: 1.05, medium: 1 },
  lifeLaps: { soft: 4, medium: 9 },
  wornLoss: 0.1,
};
