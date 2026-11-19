import { describe, expect, it } from 'vitest';
import { GP_TRACKS, RECORD_MODES, RECORDS_PER_TRACK } from '@altf1/shared';
import { LapRecords } from './LapRecords.ts';

const day = (n: number): Date => new Date(Date.UTC(2026, 10, n));

describe('LapRecords', () => {
  it('keeps a board sorted by time, with nickname, time and date', () => {
    const records = new LapRecords(':memory:');
    expect(records.submit('grandPrix', 'Monza', 'Enea', 5000, day(1))).toBe(1);
    expect(records.submit('grandPrix', 'Monza', 'Kimi', 4900, day(2))).toBe(1);
    expect(records.submit('grandPrix', 'Monza', 'Max', 5100, day(3))).toBe(3);
    expect(records.board('grandPrix', 'Monza')).toEqual([
      { nickname: 'Kimi', ticks: 4900, setAt: '2026-11-02T00:00:00.000Z' },
      { nickname: 'Enea', ticks: 5000, setAt: '2026-11-01T00:00:00.000Z' },
      { nickname: 'Max', ticks: 5100, setAt: '2026-11-03T00:00:00.000Z' },
    ]);
  });

  it('gives each player one spot, replaced only by a faster lap (nickname in any case)', () => {
    const records = new LapRecords(':memory:');
    records.submit('grandPrix', 'Monza', 'Enea', 5000, day(1));
    expect(records.submit('grandPrix', 'Monza', 'enea', 5200, day(2))).toBeNull();
    expect(records.submit('grandPrix', 'Monza', 'ENEA', 5000, day(3))).toBeNull();
    expect(records.submit('grandPrix', 'Monza', 'ENEA', 4800, day(4))).toBe(1);
    expect(records.board('grandPrix', 'Monza')).toEqual([
      { nickname: 'ENEA', ticks: 4800, setAt: '2026-11-04T00:00:00.000Z' },
    ]);
  });

  it(`keeps only the ${RECORDS_PER_TRACK} fastest per board`, () => {
    const records = new LapRecords(':memory:');
    for (let i = 0; i < RECORDS_PER_TRACK; i++) {
      records.submit('grandPrix', 'Monaco', `Driver${i}`, 5000 + i, day(1));
    }
    expect(records.submit('grandPrix', 'Monaco', 'Slow', 6000, day(2))).toBeNull();
    expect(records.submit('grandPrix', 'Monaco', 'Quick', 4000, day(2))).toBe(1);
    const board = records.board('grandPrix', 'Monaco');
    expect(board).toHaveLength(RECORDS_PER_TRACK);
    expect(board[0]!.nickname).toBe('Quick');
    expect(board.map((r) => r.nickname)).not.toContain(`Driver${RECORDS_PER_TRACK - 1}`);
  });

  it('ranks the earlier of two equal times first', () => {
    const records = new LapRecords(':memory:');
    records.submit('grandPrix', 'Monza', 'Late', 5000, day(5));
    expect(records.submit('grandPrix', 'Monza', 'Early', 5000, day(1))).toBe(1);
    expect(records.board('grandPrix', 'Monza').map((r) => r.nickname)).toEqual(['Early', 'Late']);
  });

  it('keeps circuits apart, one board each per record mode', () => {
    const records = new LapRecords(':memory:');
    records.submit('grandPrix', 'Monza', 'Enea', 5000, day(1));
    records.submit('grandPrix', 'Monaco', 'Kimi', 5100, day(1));
    expect(records.board('grandPrix', 'Barcelona')).toEqual([]);
    const boards = records.boards();
    expect(boards).toHaveLength(RECORD_MODES.length * GP_TRACKS.length);
    const names = (track: string) =>
      boards.filter((b) => b.track === track).map((b) => b.records.map((r) => r.nickname));
    expect(names('Monza')).toEqual([['Enea']]);
    expect(names('Monaco')).toEqual([['Kimi']]);
  });
});
