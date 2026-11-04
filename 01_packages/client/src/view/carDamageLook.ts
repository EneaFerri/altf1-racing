import type { CarDamage } from '@altf1/shared';

/** One half of the front wing as drawn. */
export interface WingHalfLook {
  /** How far its outer end hangs down (rad). */
  readonly droop: number;
  /** Broken off: not drawn. */
  readonly missing: boolean;
}

/** How a damaged car looks (CarView draws it). Purely cosmetic, from `CarDamage`. */
export interface CarDamageLook {
  readonly frontWing: { readonly left: WingHalfLook; readonly right: WingHalfLook };
  readonly rearWing: {
    /** Tilt of the wing about its axle, trailing edge down (rad). */
    readonly tilt: number;
    readonly missing: boolean;
  };
  /** Per wheel (order of CAR_WHEELS): 0 = round, 1 = fully flat. */
  readonly flat: readonly [number, number, number, number];
}

/** Front wing's outer end hangs down this far at full damage on one side (rad, ~9°: to the road). */
const MAX_DROOP = 0.16;
/** A wing (half) breaks off from this damage on. */
const BREAKS_AT = 0.8;
/** Rear wing tilt at full damage (rad, ~29°). */
const MAX_TILT = 0.5;
/** A tyre starts going flat from this damage on, fully flat at 1. */
const FLAT_FROM = 0.5;

/**
 * The look of `damage`. The front wing bends most on the side whose front tyre is more damaged
 * (where the hit was); from BREAKS_AT that half breaks off, and at full damage both do. The rear
 * wing tilts, then breaks off. Tyres stay round up to half damage, then go flat.
 */
export function damageLook(damage: CarDamage): CarDamageLook {
  const [fl, fr] = damage.tyres;
  const fw = damage.frontWing;
  // Share of the front wing's damage on the left: from the front tyres, even if they're equal.
  const left = fl + fr > 0 ? fl / (fl + fr) : 0.5;
  const half = (share: number, breaks: boolean): WingHalfLook => ({
    droop: Math.min(1, fw * share * 2) * MAX_DROOP,
    missing: breaks,
  });
  const leftBreaks = fw >= 1 || (fw >= BREAKS_AT && left >= 0.5);
  const rightBreaks = fw >= 1 || (fw >= BREAKS_AT && left < 0.5);
  const flat = (tyre: number): number => Math.max(0, (tyre - FLAT_FROM) / (1 - FLAT_FROM));
  const [a, b, c, d] = damage.tyres;
  return {
    frontWing: { left: half(left, leftBreaks), right: half(1 - left, rightBreaks) },
    rearWing: { tilt: damage.rearWing * MAX_TILT, missing: damage.rearWing >= BREAKS_AT },
    flat: [flat(a), flat(b), flat(c), flat(d)],
  };
}
