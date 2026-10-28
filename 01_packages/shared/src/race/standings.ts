import { TRACK_RULES } from '../config/track';
import type { CarId } from '../sim/car';
import type { LapState } from '../sim/laps';

export type RaceStatus = 'running' | 'finished' | 'dnf';

/** One driver's race so far, as the server records it. Times in ticks. */
export interface RaceDriver {
  readonly id: CarId;
  /** Nickname, kept for drivers who have left (DNF). */
  readonly name: string;
  /**
   * Tick of every timing line passed, in order: the start line (lap 1 begins), then each sector
   * line; the last one of the last lap is the finish.
   */
  readonly passes: readonly number[];
  readonly status: RaceStatus;
  /** Fastest valid lap of the race; null = none yet. */
  readonly best: number | null;
}

/** A line of the race classification. Times in ticks. */
export interface RaceStanding {
  readonly id: CarId;
  readonly name: string;
  readonly status: RaceStatus;
  /** Laps completed. */
  readonly laps: number;
  /** Race time, lights out to the flag; null until finished. */
  readonly time: number | null;
  /**
   * Behind the leader at the last timing line both passed; null for the leader, a DNF, or before
   * the start line.
   */
  readonly gap: number | null;
  /** Whole laps behind the leader (0 = on the lead lap). */
  readonly lapsBehind: number;
  readonly best: number | null;
}

/** Timing lines passed according to a car's lap timing: 0 before the start line. */
export function timingLinesPassed(lap: LapState): number {
  return lap.lapStartTick === null ? 0 : lap.laps * TRACK_RULES.sectorCount + lap.sector + 1;
}

/**
 * The race order, like an F1 timing tower updated at every timing line: whoever has passed more
 * lines is ahead, then whoever passed the last one first; DNFs at the back. `drivers` in grid
 * order, which settles ties (before the start line). `start` = lights-out tick. Pure.
 */
export function raceStandings(drivers: readonly RaceDriver[], start: number): RaceStanding[] {
  const sectors = TRACK_RULES.sectorCount;
  const order = [...drivers].sort((a, b) => {
    if ((a.status === 'dnf') !== (b.status === 'dnf')) return a.status === 'dnf' ? 1 : -1;
    const lines = b.passes.length - a.passes.length;
    if (lines !== 0 || a.passes.length === 0) return lines;
    return a.passes.at(-1)! - b.passes.at(-1)!;
  });
  const leader = order[0]?.passes ?? [];
  return order.map((driver, i) => {
    const { passes, status } = driver;
    const last = passes.length - 1;
    const behind = i > 0 && status !== 'dnf' && last >= 0 && leader[last] !== undefined;
    return {
      id: driver.id,
      name: driver.name,
      status,
      laps: Math.max(0, Math.floor(last / sectors)),
      time: status === 'finished' ? passes.at(-1)! - start : null,
      gap: behind ? passes[last]! - leader[last]! : null,
      lapsBehind: behind ? Math.floor((leader.length - 1 - last) / sectors) : 0,
      best: driver.best,
    };
  });
}
