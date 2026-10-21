import { describe, expect, it } from 'vitest';
import { SegmentGrid } from './SegmentGrid';
import { vec2 } from './vec2';

describe('SegmentGrid', () => {
  const grid = new SegmentGrid([
    [vec2(0, 0), vec2(5, 0)],
    [vec2(100, 100), vec2(105, 100)],
    [vec2(-3, 2), vec2(3, 8)],
  ]);

  it('returns nearby segments, sorted and unique', () => {
    expect(grid.query(vec2(1, 1), 3)).toEqual([0, 2]);
  });

  it('skips far-away segments', () => {
    expect(grid.query(vec2(102, 101), 2)).toEqual([1]);
    expect(grid.query(vec2(500, 500), 5)).toEqual([]);
  });
});
