import { TRACK_RULES } from '../config/track';
import type { CarId } from '../sim/car';
import type { LapState } from '../sim/laps';
import { pitPenaltyTicks } from './pitRule';

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
  /** Pit stops made in the race (Phase 4). */
  readonly stops: number;
}

/** A line of the race classification. Times in ticks. */
export interface RaceStanding {
  readonly id: CarId;
  readonly name: string;
  readonly status: RaceStatus;
  /** Laps completed. */
  readonly laps: number;
  /** Race time, lights out to the flag, with the pit penalty; null until finished. */
  readonly time: number | null;
  /**
   * Behind the leader at the last timing line both passed; null for the leader, a DNF, or before
   * the start line.
   */
  readonly gap: number | null;
  /** Whole laps behind the leader (0 = on the lead lap). */
  readonly lapsBehind: number;
  readonly best: number | null;
  /** Pit stops made. */
  readonly stops: number;
  /**
   * Time penalty for mandatory pit stops missing (ticks, `pitPenaltyTicks`), counted once the
   * driver has finished, or for everyone classified in the final result; 0 until then.
   */
  readonly penalty: number;
}

/** Timing lines passed according to a car's lap timing: 0 before the start line. */
export function timingLinesPassed(lap: LapState): number {
  return lap.lapStartTick === null ? 0 : lap.laps * TRACK_RULES.sectorCount + lap.sector + 1;
}

/**
 * The race order, like an F1 timing tower updated at every timing line: whoever has passed more
 * lines is ahead, then whoever passed the last one first, its pit penalty added; DNFs at the back.
 * The penalty (`RaceStanding.penalty`) counts for a finished driver, and with `final` (the
 * results: the race is over) for everyone classified, on the laps they completed; so a driver
 * still racing is never moved by stops they can still make. `drivers` in grid order, which settles
 * ties (before the start line). `start` = lights-out tick. Pure.
 */
export function raceStandings(
  drivers: readonly RaceDriver[],
  start: number,
  final = false,
): RaceStanding[] {
  const sectors = TRACK_RULES.sectorCount;
  const lapsOf = (driver: RaceDriver): number =>
    Math.max(0, Math.floor((driver.passes.length - 1) / sectors));
  const penalties = new Map(
    drivers.map((driver) => {
      const counted = driver.status === 'finished' || (final && driver.status === 'running');
      return [driver.id, counted ? pitPenaltyTicks(driver.stops, lapsOf(driver)) : 0];
    }),
  );
  /** Tick `driver` passed timing line `line` at, its penalty added. */
  const at = (driver: RaceDriver, line: number): number =>
    driver.passes[line]! + penalties.get(driver.id)!;
  const order = [...drivers].sort((a, b) => {
    if ((a.status === 'dnf') !== (b.status === 'dnf')) return a.status === 'dnf' ? 1 : -1;
    const lines = b.passes.length - a.passes.length;
    if (lines !== 0 || a.passes.length === 0) return lines;
    return at(a, a.passes.length - 1) - at(b, b.passes.length - 1);
  });
  const leader = order[0];
  return order.map((driver, i) => {
    const { passes, status } = driver;
    const last = passes.length - 1;
    const behind = i > 0 && status !== 'dnf' && last >= 0 && leader!.passes[last] !== undefined;
    const penalty = penalties.get(driver.id)!;
    return {
      id: driver.id,
      name: driver.name,
      status,
      laps: lapsOf(driver),
      time: status === 'finished' ? passes.at(-1)! - start + penalty : null,
      gap: behind ? at(driver, last) - at(leader!, last) : null,
      lapsBehind: behind ? Math.floor((leader!.passes.length - 1 - last) / sectors) : 0,
      best: driver.best,
      stops: driver.stops,
      penalty,
    };
  });
}
