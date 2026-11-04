import { describe, expect, it } from 'vitest';
import { TICK_RATE, type RecordBoard } from '@altf1/shared';
import { boardFor, recordRows } from './recordsText';

const board: RecordBoard = {
  mode: 'timeTrial',
  track: 'Monza',
  records: [
    { nickname: 'Kimi', ticks: 81 * TICK_RATE, setAt: '2026-11-02T18:30:00.000Z' },
    { nickname: 'Enea', ticks: 82.5 * TICK_RATE, setAt: '2026-11-04T09:00:00.000Z' },
  ],
};

describe('recordRows', () => {
  it('numbers the laps, formats time and date and marks the own one (any case)', () => {
    expect(recordRows(board.records, 'ENEA')).toEqual([
      { position: '1', nickname: 'Kimi', time: '1:21.000', date: '2026-11-02', own: false },
      { position: '2', nickname: 'Enea', time: '1:22.500', date: '2026-11-04', own: true },
    ]);
  });
});

describe('boardFor', () => {
  it('finds the board of a mode and circuit, empty when there is none', () => {
    expect(boardFor([board], 'timeTrial', 'Monza')).toBe(board.records);
    expect(boardFor([board], 'grandPrix', 'Monza')).toEqual([]);
  });
});
