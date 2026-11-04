/**
 * Pit stops (Phase 4, Grand Prix only; 01_docs/pitlane.md#pit-stop-4g). The speed limit itself is
 * the circuit's (`PitLaneDefinition.speedLimit`). Provisional until the owner's test (4i).
 */
export interface PitParams {
  /** A car this close to its box along the lane (m) and slower than `boxSpeed` (m/s) stops in it. */
  boxReach: number;
  boxSpeed: number;
  /** The box's spot: this share of the lane's half-width from its centre, towards the garages. */
  boxSide: number;
  /** A stop's time (s): the tyres, every time, plus each wing by its damage (fully damaged: this). */
  tyresTime: number;
  frontWingTime: number;
  rearWingTime: number;
}

export const PIT_PARAMS: PitParams = {
  boxReach: 5,
  boxSpeed: 8,
  boxSide: 0.5,
  tyresTime: 2.5,
  frontWingTime: 6,
  rearWingTime: 8,
};
