/** Rules of an online Grand Prix. See 01_docs/multiplayer.md#grand-prix. */
export const GRAND_PRIX = {
  /** Timed laps each driver gets in qualifying (Q1, Q2, Q3; the best one counts). */
  qualifyingLaps: 3,
  /** Race distances the GP manager can choose, in laps. */
  raceLaps: [4, 8, 12],
  /** F1 start: the red lights come on one by one, then all go out together. */
  lights: {
    count: 5,
    /** Seconds between two lights coming on. */
    interval: 1,
    /** Seconds from the manager's start to the first light. */
    delay: 1,
    /** Lights out this long after the last light came on: random in [min, max] seconds. */
    outMin: 0.2,
    outMax: 1,
  },
} as const;

export type RaceLaps = (typeof GRAND_PRIX.raceLaps)[number];
