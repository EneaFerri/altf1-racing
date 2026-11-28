/**
 * The safety car (R.3, the Grand Prix's race only; 01_docs/safetycar.md). After a hard crash into
 * a wall in a race over `minRaceLaps` laps, the safety car comes out for one lap: every car under
 * the delta while it waits for the leader, no overtaking until the control line after it goes in.
 * Provisional until the owner's test.
 */
export interface SafetyCarParams {
  /** Only races longer than this (laps) get a safety car (owner: "over 10 laps"). */
  minRaceLaps: number;
  /** A wall hit at least this hard (closing speed, m/s) brings it out: a crash leaving debris. */
  impactStrength: number;

  /** The safety car's pace: this share of the racing line's speed, never above `maxSpeed` (m/s). */
  pace: number;
  maxSpeed: number;

  /**
   * The delta: the reference time a car may not beat from the call until the safety car leaves
   * with the leader behind it, driving at this share of the racing line's speed. Once it has left,
   * no delta: the others race to the queue (owner, 2026-11-25).
   */
  deltaPace: number;
  /** Every car starts the delta this far ahead of it (s): time to brake down from racing speed. */
  deltaStart: number;
  /** A car this far under its delta (s, i.e. faster than allowed) is beating it. */
  deltaTolerance: number;
  /** Beating it this long (s) is a time penalty; back above it sooner, none (owner, 2026-11-25). */
  deltaGrace: number;

  /** A time penalty (s): beating the delta, or an overtake not given back. */
  penalty: number;
  /** An overtake under the safety car must be given back within this (s), else the penalty. */
  giveBackTime: number;
  /** Two cars closer than this along the track (m) are side by side: their order can swap. */
  passWindow: number;
  /** A car slower than this (m/s: stopped, crawling) may be overtaken. */
  slowCar: number;

  /**
   * Called, it waits at the end of the pit lane, still (once nobody is within `spawnClearance` m of
   * its spot), and goes once the leader is no more than `releaseBehind` m behind it (the owner:
   * "it waits for the leader; with it behind, it goes").
   */
  releaseBehind: number;
  spawnClearance: number;
  /** Past this share of its lap its lights go out: "SAFETY CAR IN THIS LAP". */
  inThisLap: number;
  /** It turns into the pit lane between these metres before the pit entry, after most of a lap. */
  enterFrom: number;
  enterTo: number;
}

export const SAFETY_CAR_PARAMS: SafetyCarParams = {
  minRaceLaps: 10,
  impactStrength: 28,

  pace: 0.75,
  maxSpeed: 55.6, // 200 km/h

  deltaPace: 0.6,
  deltaStart: 1,
  deltaTolerance: 0.5,
  deltaGrace: 5,

  penalty: 5,
  giveBackTime: 10,
  passWindow: 30,
  slowCar: 15,

  releaseBehind: 120,
  spawnClearance: 15,
  inThisLap: 0.5,
  enterFrom: 300,
  enterTo: 40,
};
