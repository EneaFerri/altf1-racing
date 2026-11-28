import type { CarDamage, Punctures } from '@altf1/shared';

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
  /**
   * Per wheel: punctured (`puncturedTyres`): the rim down near the road, the tread come loose and
   * flapping round it (`looseTread`), whatever `flat` says.
   */
  readonly punctured: readonly [boolean, boolean, boolean, boolean];
}

/** How a punctured wheel's loose tread sits this frame, relative to its wheel (see `looseTread`). */
export interface LooseTreadPose {
  /** Its centre above the rim's (m): resting on the road at rest, flung up by the speed. */
  readonly lift: number;
  /** Roll round the axle (rad): it slips round the rim slower than the wheel turns. */
  readonly roll: number;
  /** Yaw out of the wheel's plane (rad): the tread flapping sideways. */
  readonly flap: number;
  /** Its shape: stretched up (> 1) and squeezed along the car (< 1), then back, as it flaps. */
  readonly stretch: number;
  readonly squeeze: number;
}

/** A punctured wheel: the bare grey rim (no tyre on it), as a share of the wheel's size. */
export const PUNCTURED_RIM = 0.7;
/** The rim's centre this high above the road, as a share of the wheel's radius: the rim on it. */
export const PUNCTURED_HEIGHT = PUNCTURED_RIM;
/** The loose tread's radius, as a share of the wheel's: a little wider than the rim, round it. */
export const LOOSE_TREAD = 0.86;
/** The loose tread's lift at rest, as a share of the wheel's radius: its bottom on the road. */
const REST_LIFT = LOOSE_TREAD - PUNCTURED_HEIGHT;
/** From this speed (m/s) the loose tread flaps in full. */
const FLAP_SPEED = 25;

/**
 * The loose tread of a punctured wheel (the owner's photo: the tread torn off the carcass, floating
 * over the rim) at `seconds` into its flapping, the car at `speed` (m/s) with its wheels turned
 * `spin` (rad); `wheel` (0..3) puts each wheel out of step with the others. At rest it hangs round
 * the rim, its bottom on the road; at speed it is flung up and flaps, wobbling in and out of shape.
 */
export function looseTread(
  seconds: number,
  speed: number,
  spin: number,
  wheel: number,
): LooseTreadPose {
  const pace = Math.min(1, Math.abs(speed) / FLAP_SPEED);
  const t = seconds + wheel * 0.37;
  const r = WHEEL_RADIUS;
  return {
    lift: r * (REST_LIFT + 0.06 * pace) + pace * 0.012 * Math.sin(t * 19),
    roll: spin * 0.55,
    flap: pace * 0.14 * Math.sin(t * 13) * Math.sin(t * 5.3),
    stretch: 1 + pace * 0.07 * Math.sin(t * 23),
    squeeze: 1 - pace * 0.06 * Math.sin(t * 23 + 1.3),
  };
}

/** The wheels' radius (m), as CarView draws them. */
export const WHEEL_RADIUS = 0.36;

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
 * wing tilts, then breaks off. Tyres stay round up to half damage, then go flat; a punctured one
 * (`punctures`) sits on its rim under its loose tread.
 */
export function damageLook(damage: CarDamage, punctures?: Punctures): CarDamageLook {
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
    punctured: [!!punctures?.[0], !!punctures?.[1], !!punctures?.[2], !!punctures?.[3]],
  };
}
