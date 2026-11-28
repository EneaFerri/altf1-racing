import { describe, expect, it } from 'vitest';
import type { GrandPrixInfo, RaceStanding } from '@altf1/shared';
import { LIVERIES, playerLivery, TEAM_LIVERIES } from '../view/pixelTexture';
import type { DriverLook } from './grandPrixText';
import {
  classificationRows,
  constructorRows,
  playAgainItem,
  podiumContent,
  type RaceResult,
} from './resultsText';

const DRIVERS: DriverLook[] = [
  { id: 'p1', name: 'Enea', livery: playerLivery(0) },
  { id: 'p2', name: 'Kimi', livery: playerLivery(1) },
  { id: 'p3', name: 'Lewis', livery: playerLivery(2) },
];

const standing = (id: string, name: string, more: Partial<RaceStanding>): RaceStanding => ({
  id,
  name,
  status: 'finished',
  laps: 4,
  time: null,
  gap: null,
  lapsBehind: 0,
  best: null,
  stops: 0,
  penalty: 0,
  ...more,
});

/** Kimi wins, Enea 1.25 s behind with the fastest lap, Lewis a lap down, Max (gone) DNF. */
const RESULT: RaceResult = {
  raceLaps: 4,
  drivers: DRIVERS,
  race: [
    standing('p2', 'Kimi', { time: 30000, best: 5500, penalty: 1500 }),
    standing('p1', 'Enea', { gap: 75, best: 5400, stops: 1 }),
    standing('p3', 'Lewis', { status: 'running', laps: 3, gap: 4000, lapsBehind: 1, best: 5600 }),
    standing('p4', 'Max', { status: 'dnf', laps: 1 }),
  ],
};

const LOBBY: GrandPrixInfo = {
  phase: 'lobby',
  manager: 'p2',
  drivers: ['p2', 'p3'],
  qualifying: [],
  race: [],
  raceLaps: null,
  hold: null,
  boxes: { p2: 0, p3: 1 },
  weather: 'dry',
  forecast: [{ tick: 0, wetness: 0 }],
  sectorBests: [null, null, null],
};

describe('Grand Prix results', () => {
  it('puts the first three on the podium with the winner’s time and the gaps', () => {
    expect(podiumContent(RESULT)).toEqual({
      title: 'GRAND PRIX · PODIUM',
      places: [
        { name: 'Kimi', livery: playerLivery(1), note: '8:20.000' },
        { name: 'Enea', livery: playerLivery(0), note: '+1.250' },
        { name: 'Lewis', livery: playerLivery(2), note: '+1 LAP' },
      ],
    });
  });

  it('never puts a DNF on the podium, leaving the step empty', () => {
    const race = [RESULT.race[0]!, RESULT.race[3]!];
    expect(podiumContent({ ...RESULT, race }).places.map((p) => p.name)).toEqual(['Kimi']);
  });

  it('classifies everyone with gap, fastest lap, stops and penalty, the race’s fastest marked once', () => {
    expect(classificationRows(RESULT, 'p1')).toEqual([
      {
        position: '1',
        name: 'Kimi',
        color: playerLivery(1).body,
        gap: '8:20.000',
        bestLap: '1:31.667',
        stops: '0/1',
        stopsShort: true,
        penalty: '+25 s',
        fastest: false,
        own: false,
      },
      {
        position: '2',
        name: 'Enea',
        color: playerLivery(0).body,
        gap: '+1.250',
        bestLap: '1:30.000',
        stops: '1/1',
        stopsShort: false,
        penalty: '',
        fastest: true,
        own: true,
      },
      {
        position: '3',
        name: 'Lewis',
        color: playerLivery(2).body,
        gap: '+1 LAP',
        bestLap: '1:33.333',
        stops: '0',
        stopsShort: false,
        penalty: '',
        fastest: false,
        own: false,
      },
      {
        position: '—',
        name: 'Max',
        color: LIVERIES.grey.body,
        gap: 'DNF',
        bestLap: '—',
        stops: '0',
        stopsShort: false,
        penalty: '',
        fastest: false,
        own: false,
      },
    ]);
  });

  it('offers play again while the results or a new lobby are up, not once it started', () => {
    expect(playAgainItem({ ...LOBBY, phase: 'results' })).toEqual({
      name: 'Play again',
      value: 'playAgain',
      detail: 'Opens a new lobby here',
    });
    expect(playAgainItem(LOBBY).detail).toBe('Join the new lobby · 2 in');
    expect(playAgainItem({ ...LOBBY, phase: 'qualifying' })).toMatchObject({
      detail: 'The new GP has started',
      disabled: true,
    });
  });

  it('adds each driver’s team and points in single player (S.6)', () => {
    const rows = classificationRows(RESULT, 'p1', {
      points: { p2: 25, p1: 18, p3: 15, p4: 0 },
      teamOf: (id) => (id === 'p1' ? 'Polimi' : 'Mercedes'),
    });
    expect(rows.map((r) => [r.name, r.team, r.points])).toEqual([
      ['Kimi', 'Mercedes', '25'],
      ['Enea', 'Polimi', '18'],
      ['Lewis', 'Mercedes', '15'],
      ['Max', 'Mercedes', '0'],
    ]);
    // Online: no team, no points.
    expect(classificationRows(RESULT, 'p1')[0]).not.toHaveProperty('points');
  });

  it('lists the constructors in order, with their drivers’ points, the player’s team marked', () => {
    const rows = constructorRows(
      [
        {
          team: 'polimi',
          points: 40,
          drivers: [
            { id: 'polimi-1', name: 'Margara', points: 25 },
            { id: 'player', name: 'Enea', points: 15 },
          ],
        },
        {
          team: 'mercedes',
          points: 28,
          drivers: [
            { id: 'mercedes-0', name: 'Russell', points: 18 },
            { id: 'mercedes-1', name: 'Antonelli', points: 10 },
          ],
        },
      ],
      'polimi',
    );
    expect(rows).toEqual([
      {
        position: '1',
        name: 'Polimi',
        color: TEAM_LIVERIES.polimi.body,
        drivers: 'Margara 25 · Enea 15',
        points: '40',
        own: true,
      },
      {
        position: '2',
        name: 'Mercedes',
        color: TEAM_LIVERIES.mercedes.body,
        drivers: 'Russell 18 · Antonelli 10',
        points: '28',
        own: false,
      },
    ]);
  });
});
