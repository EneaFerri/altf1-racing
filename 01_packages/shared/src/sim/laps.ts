import { TRACK_RULES } from '../config/track';
import type { CarId } from './car';

/** A completed lap. Times are in ticks (see config/sim.ts). */
export interface LapTime {
  readonly ticks: number;
  /** Ticks of each sector, in order; they add up to `ticks`. */
  readonly sectors: readonly number[];
  readonly valid: boolean;
}

/** Free-practice timing of one car. Plain data, part of GameState. See 01_docs/laps.md. */
export interface LapState {
  readonly carId: CarId;
  /** Progress along the centreline at the last tick (m from the start line). */
  readonly distance: number;
  /** Sector being driven (0-based); -1 = out-lap, before the first crossing of the line. */
  readonly sector: number;
  /** Tick the current lap started on (null during the out-lap). */
  readonly lapStartTick: number | null;
  readonly sectorStartTick: number;
  /** Ticks of the sectors already completed in this lap. */
  readonly currentSectors: readonly number[];
  /** False once something voids the current lap (a reset). */
  readonly valid: boolean;
  /** Completed laps (valid or not). */
  readonly laps: number;
  readonly lastLap: LapTime | null;
  /** Fastest valid lap. */
  readonly bestLap: LapTime | null;
  /** Fastest time per sector over all valid laps (null = none yet). */
  readonly bestSectors: readonly (number | null)[];
}

export function createLapState(carId: CarId, distance: number): LapState {
  return {
    carId,
    distance,
    sector: -1,
    lapStartTick: null,
    sectorStartTick: 0,
    currentSectors: [],
    valid: true,
    laps: 0,
    lastLap: null,
    bestLap: null,
    bestSectors: Array(TRACK_RULES.sectorCount).fill(null),
  };
}

/** Distance along the track where sector `sector` ends; the last one ends on the start line (0). */
export function sectorEnd(sector: number, trackLength: number): number {
  const count = TRACK_RULES.sectorCount;
  return sector >= count - 1 ? 0 : ((sector + 1) * trackLength) / count;
}

/**
 * Advances a car's timing to `tick`, given its new progress `distance` along the track.
 * Only moving forward across the boundary the car is expected to reach next counts, so driving
 * backwards, reversing over a line or skipping a sector never times anything. Pure.
 */
export function stepLap(
  lap: LapState,
  distance: number,
  reset: boolean,
  tick: number,
  trackLength: number,
): LapState {
  const current: LapState = { ...lap, distance, valid: lap.valid && !reset };
  const delta = wrapDistance(distance - lap.distance, trackLength);
  const boundary = lap.sector < 0 ? 0 : sectorEnd(lap.sector, trackLength);
  const ahead = mod(boundary - lap.distance, trackLength);
  if (delta <= 0 || ahead === 0 || ahead > delta) return current;

  if (lap.sector < 0) return startLap(current, tick);

  const currentSectors = [...current.currentSectors, tick - current.sectorStartTick];
  if (lap.sector < TRACK_RULES.sectorCount - 1) {
    return { ...current, sector: lap.sector + 1, sectorStartTick: tick, currentSectors };
  }
  return startLap(finishLap(current, currentSectors, tick), tick);
}

function finishLap(lap: LapState, sectors: readonly number[], tick: number): LapState {
  const lastLap: LapTime = { ticks: tick - lap.lapStartTick!, sectors, valid: lap.valid };
  if (!lap.valid) return { ...lap, laps: lap.laps + 1, lastLap };
  return {
    ...lap,
    laps: lap.laps + 1,
    lastLap,
    bestLap: !lap.bestLap || lastLap.ticks < lap.bestLap.ticks ? lastLap : lap.bestLap,
    bestSectors: lap.bestSectors.map((best, i) =>
      best === null || sectors[i]! < best ? sectors[i]! : best,
    ),
  };
}

function startLap(lap: LapState, tick: number): LapState {
  return {
    ...lap,
    sector: 0,
    lapStartTick: tick,
    sectorStartTick: tick,
    currentSectors: [],
    valid: true,
  };
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}

/** Progress change wrapped into (-length/2, length/2], so crossing the start line isn't a huge jump. */
function wrapDistance(delta: number, length: number): number {
  const wrapped = mod(delta, length);
  return wrapped > length / 2 ? wrapped - length : wrapped;
}
