import { describe, expect, it } from 'vitest';
import { qualifyingOrder, type QualifyingEntry } from './qualifying';

const entry = (id: string, best: number | null, setAt: number | null = best): QualifyingEntry => ({
  id,
  best,
  setAt,
  laps: 3,
  done: true,
});

describe('qualifyingOrder', () => {
  it('puts the fastest first and drivers without a time at the back, in arrival order', () => {
    const order = qualifyingOrder([
      entry('p1', null),
      entry('p2', 5400),
      entry('p3', null),
      entry('p4', 5300),
    ]);
    expect(order.map((e) => e.id)).toEqual(['p4', 'p2', 'p1', 'p3']);
  });

  it('gives an equal time to whoever set it first', () => {
    const order = qualifyingOrder([entry('p1', 5400, 9000), entry('p2', 5400, 7000)]);
    expect(order.map((e) => e.id)).toEqual(['p2', 'p1']);
  });
});
