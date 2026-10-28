import type { CarId } from '../sim/car';

/** One driver's qualifying so far. Times in ticks. */
export interface QualifyingEntry {
  readonly id: CarId;
  /** Fastest valid timed lap; null = no time yet. */
  readonly best: number | null;
  /** Tick that best lap was set on (it decides a tie); null with no time. */
  readonly setAt: number | null;
  /** Timed laps completed (valid or not). */
  readonly laps: number;
  /** All timed laps driven: the car has left the track. */
  readonly done: boolean;
}

/**
 * Qualifying order, which is also the starting grid: fastest first; equal times go to whoever set
 * theirs first; drivers with no time at the back, in the order given (arrival). Pure.
 */
export function qualifyingOrder(entries: readonly QualifyingEntry[]): QualifyingEntry[] {
  return [...entries].sort((a, b) => {
    if (a.best === null || b.best === null)
      return Number(a.best === null) - Number(b.best === null);
    return a.best - b.best || a.setAt! - b.setAt!;
  });
}
