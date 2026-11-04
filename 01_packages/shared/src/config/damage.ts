/**
 * Car damage (Phase 4, Grand Prix only; 01_docs/damage.md). How much a hit or a stretch on grass or
 * gravel damages a car's parts, each from 0 (as new) to 1 (fully damaged). Provisional: tuned with
 * the effects (4b) and the owner's test (4i).
 */
export interface DamageParams {
  /** Hits slower than this (m/s of closing speed) do no damage: leaning on a car, scraping a wall. */
  impactThreshold: number;
  /** Damage to the part hit per m/s of closing speed above the threshold. */
  impactDamage: number;
  /** Share of a front (rear) hit's damage that also goes to the two front (rear) tyres. */
  endTyreShare: number;
  /** Share of a side hit's damage that goes to the two tyres on that side. */
  sideTyreShare: number;
  /**
   * Contact points further ahead of the car's centre than this (m) are front hits, further behind
   * than `rearZone` rear hits; in between, side hits. The collider runs from +2.8 to −2.4 m.
   */
  frontZone: number;
  rearZone: number;
  /** Tyre damage per second per wheel on grass and on gravel, at `offTrackSpeed` or faster. */
  grassDamage: number;
  gravelDamage: number;
  /** Speed (m/s) from which off-track damage is full; slower scales it down, at rest none. */
  offTrackSpeed: number;
}

export const DAMAGE_PARAMS: DamageParams = {
  impactThreshold: 4,
  impactDamage: 0.025,
  endTyreShare: 0.5,
  sideTyreShare: 0.6,
  frontZone: 1,
  rearZone: 0.7,
  grassDamage: 0.03,
  gravelDamage: 0.08,
  offTrackSpeed: 30,
};
