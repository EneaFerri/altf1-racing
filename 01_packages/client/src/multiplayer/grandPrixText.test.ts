import { describe, expect, it } from 'vitest';
import {
  createLapState,
  type GrandPrixInfo,
  type PlayerInfo,
  type QualifyingEntry,
  type RaceStanding,
} from '@altf1/shared';
import { LIVERIES, playerLivery } from '../view/pixelTexture';
import { grandPrixContent, lapName } from './grandPrixText';

const PLAYERS: PlayerInfo[] = [
  { id: 'p1', nickname: 'Enea', livery: 0 },
  { id: 'p2', nickname: 'Kimi', livery: 1 },
];

const LOBBY: GrandPrixInfo = {
  phase: 'lobby',
  manager: 'p1',
  drivers: ['p1', 'p2'],
  qualifying: [],
  race: [],
  raceLaps: null,
  hold: null,
  boxes: { p1: 0, p2: 1 },
};

/** Kimi fastest and done, Enea without a time, on Q2. */
const QUALIFYING: QualifyingEntry[] = [
  { id: 'p2', best: 5400, setAt: 6000, laps: 3, done: true },
  { id: 'p1', best: null, setAt: null, laps: 1, done: false },
];

const standing = (id: string, name: string, more: Partial<RaceStanding>): RaceStanding => ({
  id,
  name,
  status: 'running',
  laps: 3,
  time: null,
  gap: null,
  lapsBehind: 0,
  best: null,
  stops: 0,
  ...more,
});

/** Enea leads on lap 4, Kimi 1.25 s behind, Lewis a lap down, Max (gone) out. */
const RACE: RaceStanding[] = [
  standing('p1', 'Enea', {}),
  standing('p2', 'Kimi', { gap: 75 }),
  standing('p3', 'Lewis', { laps: 2, gap: 4000, lapsBehind: 1 }),
  standing('p4', 'Max', { status: 'dnf' }),
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

  it('lists only the drivers of a new lobby, and says when it has no manager', () => {
    const playAgain: GrandPrixInfo = { ...LOBBY, manager: 'p2', drivers: ['p2'] };
    expect(grandPrixContent(playAgain, PLAYERS, 'p2').rows.map((r) => r.name)).toEqual(['Kimi']);
    const empty: GrandPrixInfo = { ...LOBBY, manager: null, drivers: [] };
    expect(grandPrixContent(empty, PLAYERS, 'p1')).toMatchObject({
      rows: [],
      hint: 'Waiting for a driver: the next one in is the manager',
    });
  });

  it('tells a player left out of a new GP that started that they can only leave', () => {
    const info: GrandPrixInfo = { ...LOBBY, phase: 'qualifying', drivers: ['p2'] };
    expect(grandPrixContent(info, PLAYERS, 'p1')).toEqual({
      title: 'GRAND PRIX · IN PROGRESS',
      rows: [],
      hint: 'The new GP started without you — Esc: back to the start',
    });
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
  });

  it('shows the race order with the leader’s lap, gaps, laps down and DNFs', () => {
    const info: GrandPrixInfo = { ...LOBBY, phase: 'race', raceLaps: 8, race: RACE };
    const forKimi = grandPrixContent(info, PLAYERS, 'p2');
    expect(forKimi.title).toBe('GRAND PRIX · RACE · 8 LAPS');
    expect(forKimi.rows.map((r) => [r.name, r.note])).toEqual([
      ['1  Enea', 'LAP 4/8'],
      ['2  Kimi', '+1.250'],
      ['3  Lewis', '+1 LAP'],
      ['4  Max', 'DNF'],
    ]);
    expect(forKimi.rows[3]!.color).toBe(LIVERIES.grey.body); // left: no livery any more
    expect(forKimi.hint).toBe('');
    expect(grandPrixContent(info, PLAYERS, 'p1').hint).toBe('Enter: end the race now');
  });

  it('marks the drivers in the pit lane: PIT, or BOX while stopped (race and qualifying)', () => {
    const pits = new Map([
      ['p1', 'BOX' as const],
      ['p2', 'PIT' as const],
    ]);
    const race = grandPrixContent(
      { ...LOBBY, phase: 'race', raceLaps: 8, race: RACE },
      PLAYERS,
      'p1',
      pits,
    );
    expect(race.rows.map((r) => r.pit)).toEqual(['BOX', 'PIT', undefined, undefined]);
    const qualifying = grandPrixContent(
      { ...LOBBY, phase: 'qualifying', qualifying: QUALIFYING },
      PLAYERS,
      'p1',
      pits,
    );
    expect(qualifying.rows.map((r) => r.pit)).toEqual(['PIT', 'BOX']);
    const results = grandPrixContent(
      { ...LOBBY, phase: 'results', raceLaps: 8, race: RACE },
      PLAYERS,
      'p1',
      pits,
    );
    expect(results.rows.every((r) => r.pit === undefined)).toBe(true);
  });

  it('shows the winner’s race time and the finishers’ gaps in the results', () => {
    const finished = RACE.slice(0, 2).map((s) => ({ ...s, status: 'finished' as const }));
    const results: RaceStanding[] = [{ ...finished[0]!, time: 30000 }, finished[1]!];
    const info: GrandPrixInfo = { ...LOBBY, phase: 'results', raceLaps: 8, race: results };
    const content = grandPrixContent(info, PLAYERS, 'p2');
    expect(content.title).toBe('GRAND PRIX · RESULTS');
    expect(content.rows.map((r) => r.note)).toEqual(['8:20.000', '+1.250']);
  });

  it('names the laps: Q1–Q3 in qualifying, position and lap in the race', () => {
    const lap = { ...createLapState('p2', 0), lapStartTick: 10, laps: 1 };
    const outLap = createLapState('p2', 0);
    const qualifying = lapName({ ...LOBBY, phase: 'qualifying' }, 'p2');
    expect([qualifying(outLap), qualifying(lap)]).toEqual(['OUT LAP', 'Q2']);
    const race = lapName({ ...LOBBY, phase: 'race', raceLaps: 8, race: RACE }, 'p2');
    expect([race(outLap), race(lap)]).toEqual(['P2/4 · LAP 1/8', 'P2/4 · LAP 2/8']);
    expect(lapName(LOBBY, 'p2')(lap)).toBe('LAP 2');
  });
});
