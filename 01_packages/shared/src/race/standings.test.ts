import { describe, expect, it } from 'vitest';
import { createLapState } from '../sim/laps';
import { raceStandings, timingLinesPassed, type RaceDriver } from './standings';

const driver = (id: string, passes: number[], status: RaceDriver['status'] = 'running') => ({
  id,
  name: id.toUpperCase(),
  passes,
  status,
  best: null,
});

describe('race standings', () => {
  it('counts the timing lines a car has passed from its lap timing', () => {
    const lap = createLapState('p1', 0);
    expect(timingLinesPassed(lap)).toBe(0); // on the grid, before the start line
    expect(timingLinesPassed({ ...lap, lapStartTick: 10, sector: 0 })).toBe(1);
    expect(timingLinesPassed({ ...lap, lapStartTick: 10, sector: 2, laps: 1 })).toBe(6);
  });

  it('orders by lines passed, then by who passed the last one first; DNFs last', () => {
    const order = raceStandings(
      [
        driver('p1', [100, 400]),
        driver('p2', [110, 390, 700]),
        driver('p3', [105, 395]),
        driver('p4', [101, 380, 690, 1000], 'dnf'),
      ],
      0,
    );
    expect(order.map((s) => s.id)).toEqual(['p2', 'p3', 'p1', 'p4']);
    expect(order.map((s) => s.gap)).toEqual([null, 5, 10, null]);
  });

  it('keeps the grid order before anyone reaches the start line', () => {
    const order = raceStandings([driver('p2', []), driver('p1', [])], 0);
    expect(order.map((s) => [s.id, s.laps, s.gap])).toEqual([
      ['p2', 0, null],
      ['p1', 0, null],
    ]);
  });

  it('gives finishers their race time and counts the laps a lapped car is behind', () => {
    // Two-lap race with 3 sectors: 7 lines (start + 3 per lap); lights out on tick 40.
    const winner = driver('p1', [50, 100, 150, 200, 250, 300, 350], 'finished');
    const second = driver('p2', [52, 104, 156, 208, 260, 312, 364], 'finished');
    const lapped = driver('p3', [55, 120, 185, 250]);
    const order = raceStandings([second, lapped, winner], 40);
    expect(order.map((s) => [s.id, s.laps, s.time, s.gap, s.lapsBehind])).toEqual([
      ['p1', 2, 310, null, 0],
      ['p2', 2, 324, 14, 0],
      ['p3', 1, null, 50, 1],
    ]);
  });
});
