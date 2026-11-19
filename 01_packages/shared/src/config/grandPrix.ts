/** Rules of an online Grand Prix. See 01_docs/multiplayer.md#grand-prix. */
export const GRAND_PRIX = {
  /** Timed laps each driver gets in qualifying (Q1, Q2, Q3; the best one counts). */
  qualifyingLaps: 3,
  /** The race distances offered on keys 1/2/3, in laps. */
  raceLaps: [4, 8, 12],
  /** Any other distance (key 4, then ←/→): from `min` to `max` laps, starting at `start`. */
  customLaps: { min: 1, max: 24, start: 12 },
  /**
   * Mandatory pit stops: one per `lapsPerStop` laps of the race, rounded down, at most
   * `maxRequired` (5 laps → 1, 8 → 2, 11 → 2, 16 and more → 4); no limit on extra stops. Each one
   * missing adds `penaltySeconds` to the driver's race time (see race/pitRule.ts).
   */
  pitRule: { lapsPerStop: 4, maxRequired: 4, penaltySeconds: 25 },
  /** F1 points for the first ten classified (single player's GP, S.6); none below, none for a DNF. */
  points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
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

/** Whether `laps` is a race distance the manager may choose: a whole number in `customLaps`. */
export function isRaceLaps(laps: unknown): laps is number {
  const { min, max } = GRAND_PRIX.customLaps;
  return Number.isInteger(laps) && (laps as number) >= min && (laps as number) <= max;
}
