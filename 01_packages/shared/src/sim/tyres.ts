import type { CarParams } from '../config/car';
import type { TyreCompound, TyreParams } from '../config/tyres';

/** The set of tyres a car runs on (T.1, the Grand Prix only; 01_docs/tyres.md). */
export interface TyreState {
  readonly compound: TyreCompound;
  /** 0 = new, 1 = fully worn. */
  readonly wear: number;
}

/** What every car starts on, and what a car without `CarState.tyres` runs on. */
export const NEW_MEDIUMS: TyreState = { compound: 'medium', wear: 0 };

/** A new set of `compound`. */
export function fitTyres(compound: TyreCompound): TyreState {
  return { compound, wear: 0 };
}

/**
 * The car on `tyres`: its grip and turning by the compound's `grip`, its acceleration by its
 * `traction`, each less by `wornLoss` × wear.
 */
export function tyredParams(params: CarParams, tyres: TyreState, p: TyreParams): CarParams {
  const worn = 1 - p.wornLoss * tyres.wear;
  const grip = p.grip[tyres.compound] * worn;
  return {
    ...params,
    lateralGrip: params.lateralGrip * grip,
    maxYawRate: params.maxYawRate * grip,
    engineAccel: params.engineAccel * p.traction[tyres.compound] * worn,
  };
}

/** `tyres` after driving `metres` on a circuit `lapLength` long: worn by the share of their life. */
export function wearTyres(
  tyres: TyreState,
  metres: number,
  lapLength: number,
  p: TyreParams,
): TyreState {
  if (metres <= 0 || tyres.wear >= 1) return tyres;
  const wear = Math.min(1, tyres.wear + metres / (p.lifeLaps[tyres.compound] * lapLength));
  return { compound: tyres.compound, wear };
}
