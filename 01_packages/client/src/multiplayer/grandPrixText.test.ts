import { describe, expect, it } from 'vitest';
import type { GrandPrixInfo, PlayerInfo, QualifyingEntry } from '@altf1/shared';
import { playerLivery } from '../view/pixelTexture';
import { grandPrixContent, lapName } from './grandPrixText';

const PLAYERS: PlayerInfo[] = [
  { id: 'p1', nickname: 'Enea', livery: 0 },
  { id: 'p2', nickname: 'Kimi', livery: 1 },
];

const LOBBY: GrandPrixInfo = {
  phase: 'lobby',
  manager: 'p1',
  qualifying: [],
  raceLaps: null,
  hold: null,
};

/** Kimi fastest and done, Enea without a time, on Q2. */
const QUALIFYING: QualifyingEntry[] = [
  { id: 'p2', best: 5400, setAt: 6000, laps: 3, done: true },
  { id: 'p1', best: null, setAt: null, laps: 1, done: false },
];

describe('Grand Prix panel', () => {
  it('lists the drivers with the manager marked and tells the manager how to start', () => {
    expect(grandPrixContent(LOBBY, PLAYERS, 'p1')).toEqual({
      title: 'GRAND PRIX · WAITING',
      rows: [
        { name: 'Enea', color: playerLivery(0).body, note: 'manager', own: true },
        { name: 'Kimi', color: playerLivery(1).body, note: '', own: false },
      ],
      hint: 'You are the GP manager — Enter: start the GP',
    });
    expect(grandPrixContent(LOBBY, PLAYERS, 'p2').hint).toBe('Waiting for Enea to start the GP');
  });

  it('shows qualifying as a timing tower: best time and which lap each driver is on', () => {
    const info: GrandPrixInfo = { ...LOBBY, phase: 'qualifying', qualifying: QUALIFYING };
    const forKimi = grandPrixContent(info, PLAYERS, 'p2');
    expect(forKimi.title).toBe('GRAND PRIX · QUALIFYING');
    expect(forKimi.rows.map((r) => [r.name, r.note])).toEqual([
      ['1  Kimi', '1:30.000 · done'],
      ['2  Enea', 'no time · Q2'],
    ]);
    expect(forKimi.hint).toBe('Your laps are done — watching the others');
    expect(grandPrixContent(info, PLAYERS, 'p1').hint).toBe('Enter: end qualifying now');
  });

  it('shows the grid with the manager’s lap choices, then the race distance', () => {
    const grid: GrandPrixInfo = { ...LOBBY, phase: 'grid', qualifying: QUALIFYING };
    const forEnea = grandPrixContent(grid, PLAYERS, 'p1');
    expect(forEnea.rows.map((r) => [r.name, r.note])).toEqual([
      ['P1  Kimi', '1:30.000'],
      ['P2  Enea', 'no time'],
    ]);
    expect(forEnea.hint).toBe('Start the race — 1: 4 laps · 2: 8 laps · 3: 12 laps');
    expect(grandPrixContent(grid, PLAYERS, 'p2').hint).toBe('Waiting for Enea to start the race');
    const race = grandPrixContent({ ...grid, phase: 'race', raceLaps: 8 }, PLAYERS, 'p2');
    expect(race).toMatchObject({ title: 'GRAND PRIX · RACE · 8 LAPS', hint: '' });
  });

  it('names the laps Q1–Q3 in qualifying only', () => {
    expect(lapName({ ...LOBBY, phase: 'qualifying' })(1)).toBe('Q2');
    expect(lapName(LOBBY)(1)).toBe('LAP 2');
    expect(lapName(null)(0)).toBe('LAP 1');
  });
});
