import { describe, expect, it } from 'vitest';
import { TRACK_RULES } from '../config/track';
import { createLapState, sectorEnd, stepLap, type LapState } from './laps';

const L = 1200;
const SECTOR = L / TRACK_RULES.sectorCount;

/** Drives a car's timing through a list of distances, one per tick, starting at `fromTick`. */
function drive(lap: LapState, distances: number[], fromTick = 1, reset = (_tick: number) => false) {
  distances.forEach((d, i) => {
    lap = stepLap(lap, d, reset(fromTick + i), fromTick + i, L);
  });
  return lap;
}

/** Distances from `from` going forward `metres`, `step` m per tick, wrapped over the line. */
function forwardFrom(from: number, metres: number, step: number): number[] {
  const out: number[] = [];
  for (let m = step; m <= metres; m += step) out.push((from + m) % L);
  return out;
}

describe('sectorEnd', () => {
  it('splits the lap into equal sectors, the last one ending on the line', () => {
    expect(sectorEnd(0, L)).toBe(400);
    expect(sectorEnd(1, L)).toBe(800);
    expect(sectorEnd(2, L)).toBe(0);
  });
});

describe('stepLap', () => {
  it('the first crossing of the line ends the out-lap and starts lap 1 without a time', () => {
    const lap = drive(createLapState('p', L - 10), forwardFrom(L - 10, 20, 2));
    expect(lap.sector).toBe(0);
    expect(lap.lapStartTick).toBe(5); // L-10 + 5·2 = the line
    expect(lap.laps).toBe(0);
    expect(lap.lastLap).toBeNull();
  });

  it('times a full lap in ticks, with sectors adding up to it', () => {
    const started = drive(createLapState('p', L - 2), [0]); // tick 1 on the line
    const lap = drive(started, forwardFrom(0, L, 2), 2); // 600 ticks, 200 per sector
    expect(lap.laps).toBe(1);
    expect(lap.lastLap).toEqual({ ticks: 600, sectors: [200, 200, 200], valid: true });
    expect(lap.bestLap).toEqual(lap.lastLap);
    expect(lap.bestSectors).toEqual([200, 200, 200]);
    expect(lap.lapStartTick).toBe(601);
  });

  it('does not count going backwards or reversing over the line', () => {
    const started = drive(createLapState('p', L - 2), [0]);
    // Back over the line and forward again: still lap 1, sector 0, nothing recorded.
    const back = drive(started, [L - 5, L - 10, L - 5, 0, 5, 10], 2);
    expect(back.laps).toBe(0);
    expect(back.sector).toBe(0);
    expect(back.lapStartTick).toBe(1);
  });

  it('only the expected boundary counts: sectors must come in order', () => {
    const started = drive(createLapState('p', L - 2), [0]);
    // A big jump to the middle of sector 3 (e.g. a teleport) skips S1's end: no sector is timed.
    const jumped = drive(started, [SECTOR * 2.5], 2);
    expect(jumped.sector).toBe(0);
    expect(jumped.currentSectors).toEqual([]);
  });

  it('a reset voids the lap: shown as last lap, but never as a best', () => {
    const first = drive(drive(createLapState('p', L - 2), [0]), forwardFrom(0, L, 2), 2);
    const invalid = drive(first, forwardFrom(0, L, 4), 602, (tick) => tick === 700);
    expect(invalid.lastLap).toEqual({ ticks: 300, sectors: [100, 100, 100], valid: false });
    expect(invalid.bestLap!.ticks).toBe(600);
    expect(invalid.bestSectors).toEqual([200, 200, 200]);
    expect(invalid.valid).toBe(true); // the new lap starts clean
  });

  it('keeps the best lap and the best time of each sector, even from different laps', () => {
    let lap = drive(createLapState('p', L - 2), [0]);
    let tick = 2;
    const lapWith = (speeds: number[]) => {
      speeds.forEach((step) => {
        const distances = forwardFrom(lap.distance, SECTOR, step);
        lap = drive(lap, distances, tick);
        tick += distances.length;
      });
    };
    lapWith([2, 4, 2]); // sectors 200, 100, 200 → 500
    lapWith([4, 2, 4]); // sectors 100, 200, 100 → 400
    expect(lap.laps).toBe(2);
    expect(lap.bestLap!.ticks).toBe(400);
    expect(lap.bestSectors).toEqual([100, 100, 100]);
  });
});
