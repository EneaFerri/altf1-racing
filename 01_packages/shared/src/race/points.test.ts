import { describe, expect, it } from 'vitest';
import { constructorStandings, racePoints } from './points';
import type { RaceStanding } from './standings';
import { teamLineup } from './teams';

const standing = (id: string, status: RaceStanding['status'] = 'finished'): RaceStanding => ({
  id,
  name: id,
  status,
  laps: 4,
  time: null,
  gap: null,
  lapsBehind: 0,
  best: null,
  stops: 1,
  penalty: 0,
});

describe('points (S.6)', () => {
  it('gives F1 points to the first ten classified, none to a DNF', () => {
    const race = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map((id) => standing(id));
    expect(Object.values(racePoints(race))).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0]);
    expect(racePoints([standing('a'), standing('b', 'dnf')])).toEqual({ a: 25, b: 0 });
  });

  it('adds up each team, most first; a tie goes to the better placed driver', () => {
    const seats = teamLineup('polimi', () => 0); // the player replaces IngConti
    // Order: Margara (Polimi), Russell, You (Polimi), Leclerc, Antonelli, Hamilton, ...
    const order = [
      'polimi-1',
      'mercedes-0',
      'player',
      'ferrari-0',
      'mercedes-1',
      'ferrari-1',
      'redBull-0',
      'mclaren-0',
      'redBull-1',
      'mclaren-1',
    ];
    const race = order.map((id) => standing(id));
    const table = constructorStandings(race, racePoints(race), seats);
    expect(table.map((t) => [t.team, t.points])).toEqual([
      ['polimi', 40], // 25 + 15
      ['mercedes', 28], // 18 + 10
      ['ferrari', 20], // 12 + 8
      ['redBull', 8], // 6 + 2
      ['mclaren', 5], // 4 + 1
    ]);
    expect(table[0]!.drivers.map((d) => [d.name, d.points])).toEqual([
      ['Margara', 25],
      ['You', 15],
    ]);
    // A tie: the team whose best driver finished higher is ahead.
    const tie = [standing('mclaren-0'), standing('redBull-0')];
    const tied = constructorStandings(tie, { 'mclaren-0': 10, 'redBull-0': 10 }, seats);
    expect(tied.slice(0, 2).map((t) => t.team)).toEqual(['mclaren', 'redBull']);
  });
});
