import { describe, expect, it } from 'vitest';
import type { GrandPrixInfo, PlayerInfo, RaceStanding } from '@altf1/shared';
import { LIVERIES, playerLivery } from '../view/pixelTexture';
import { classificationRows, playAgainItem, podiumContent, type RaceResult } from './resultsText';

const PLAYERS: PlayerInfo[] = [
  { id: 'p1', nickname: 'Enea', livery: 0 },
  { id: 'p2', nickname: 'Kimi', livery: 1 },
  { id: 'p3', nickname: 'Lewis', livery: 2 },
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
  ...more,
});

/** Kimi wins, Enea 1.25 s behind with the fastest lap, Lewis a lap down, Max (gone) DNF. */
const RESULT: RaceResult = {
  raceLaps: 4,
  players: PLAYERS,
  race: [
    standing('p2', 'Kimi', { time: 30000, best: 5500 }),
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

  it('classifies everyone with gap, fastest lap and stops, the race’s fastest marked once', () => {
    expect(classificationRows(RESULT, 'p1')).toEqual([
      {
        position: '1',
        name: 'Kimi',
        color: playerLivery(1).body,
        gap: '8:20.000',
        bestLap: '1:31.667',
        stops: '0',
        fastest: false,
        own: false,
      },
      {
        position: '2',
        name: 'Enea',
        color: playerLivery(0).body,
        gap: '+1.250',
        bestLap: '1:30.000',
        stops: '1',
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
});
