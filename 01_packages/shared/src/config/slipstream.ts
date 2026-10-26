/**
 * Slipstream: a car close behind another one at speed meets less air and gets towed along.
 * Units are SI (m, s, m/s, rad). Meaning and measured effect in 01_docs/physics.md#slipstream.
 * Editable live in the dev tuning panel (F2 → Slipstream).
 */
export interface SlipstreamParams {
  /** Wake length behind the leading car, centre to centre (m): no tow beyond it. */
  range: number;
  /** Gap (centre to centre, m) at which the tow is full: about nose to gearbox. */
  fullGap: number;
  /** Half width of the wake (m): the tow fades to 0 this far to the side of the leader's axis. */
  halfWidth: number;
  /** Largest heading difference to the leader that still gets a tow (rad). */
  maxHeadingDiff: number;
  /** Leader's forward speed (m/s) below which there is no wake at all. */
  minSpeed: number;
  /** Leader's forward speed (m/s) from which the wake is at full strength. */
  fullSpeed: number;
  /** Fraction of air drag removed at full tow (0..1). */
  dragCut: number;
  /** Extra forward push at full tow while on throttle (m/s²). */
  towAccel: number;
}

export const SLIPSTREAM_PARAMS: SlipstreamParams = {
  range: 40,
  fullGap: 6,
  halfWidth: 3,
  maxHeadingDiff: Math.PI / 4,
  minSpeed: 25,
  fullSpeed: 60,
  dragCut: 0.45,
  towAccel: 1,
};
