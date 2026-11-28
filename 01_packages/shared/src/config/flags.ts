/**
 * Yellow flags and debris (R.2, the Grand Prix's qualifying and race; 01_docs/flags.md): a car
 * hitting a wall hard leaves debris on the track and brings out the yellow flag in that sector.
 * Provisional until the owner's test.
 */
export interface FlagParams {
  /** A wall hit at least this hard (closing speed, m/s) leaves debris (the safety car's: 28). */
  debrisImpact: number;
  /** The debris stays on the track, and the sector's yellow flag out, this long (s). */
  seconds: number;
  /** The same car's hits closer together than this (s) are one crash (scraping along a wall). */
  sameCrash: number;
}

export const FLAG_PARAMS: FlagParams = {
  debrisImpact: 22,
  seconds: 15,
  sameCrash: 2,
};
