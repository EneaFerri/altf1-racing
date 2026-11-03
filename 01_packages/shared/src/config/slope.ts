/**
 * Slopes (Phase 3, elevation: only Monaco v2 has heights; 01_docs/elevation.md). Along the car's
 * heading, a slope pushes it back uphill and on downhill by gravity × `factor` × grade. Owner's
 * choice: real, but not too strong. Editable live in the dev tuning panel (F2 → Slope).
 */
export interface SlopeParams {
  /** Gravity (m/s²). */
  gravity: number;
  /** Share of the real pull felt (0 = none, 1 = full gravity along the slope). */
  factor: number;
}

export const SLOPE_PARAMS: SlopeParams = {
  gravity: 9.81,
  factor: 0.5,
};
