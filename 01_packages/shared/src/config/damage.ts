/**
 * Car damage (Phase 4, Grand Prix only; 01_docs/damage.md). How much a hit or a stretch on grass or
 * gravel damages a car's parts, each from 0 (as new) to 1 (fully damaged), and what that costs the
 * car. Provisional until the owner's test (4i). Editable live in the dev tuning panel (F2 → Damage).
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

  /**
   * Effects: the share of the car's top speed (`maxSpeed`), turning (`maxYawRate`) and grip
   * (`lateralGrip`) a part costs when fully damaged; less damage costs proportionally less. The
   * tyres count by their average. Costs of several parts add up, down to the floors below.
   */
  frontWingSpeedLoss: number;
  frontWingTurnLoss: number;
  frontWingGripLoss: number;
  rearWingSpeedLoss: number;
  rearWingTurnLoss: number;
  rearWingGripLoss: number;
  tyreSpeedLoss: number;
  tyreTurnLoss: number;
  tyreGripLoss: number;
  /**
   * Steering added towards the more damaged side, per unit of difference between the left and the
   * right tyres (−1..1 of the steering range): a car with damaged right tyres pulls right.
   */
  tyrePull: number;
  /** The least share of top speed, turning and grip a car ever keeps: it always stays drivable. */
  minSpeed: number;
  minTurn: number;
  minGrip: number;
}

export const DAMAGE_PARAMS: DamageParams = {
  impactThreshold: 8,
  impactDamage: 0.018,
  endTyreShare: 0.5,
  sideTyreShare: 0.6,
  frontZone: 1,
  rearZone: 0.7,
  grassDamage: 0.015,
  gravelDamage: 0.05,
  offTrackSpeed: 30,

  frontWingSpeedLoss: 0.04,
  frontWingTurnLoss: 0.25,
  frontWingGripLoss: 0,
  rearWingSpeedLoss: 0.04,
  rearWingTurnLoss: 0,
  rearWingGripLoss: 0.3,
  tyreSpeedLoss: 0.08,
  tyreTurnLoss: 0.1,
  tyreGripLoss: 0.3,
  tyrePull: 0.12,
  minSpeed: 0.8,
  minTurn: 0.6,
  minGrip: 0.5,
};
