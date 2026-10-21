import { describe, expect, it } from 'vitest';
import { add, distance, scale, vec2, type Vec2 } from '../math/vec2';
import { buildTrack } from './buildTrack';
import { TEST_TRACK } from './layouts/testTrack';
import { gridSlot, locateOnTrack, surfaceAt } from './query';

const track = buildTrack(TEST_TRACK);
/** Point `lateral` metres to the right (negative = left) of sample `i`. */
const beside = (i: number, lateral: number): Vec2 =>
  add(track.samples[i]!.position, scale(track.samples[i]!.normal, lateral));

const tightest = track.samples.reduce(
  (best, s, i) => (Math.abs(s.curvature) > Math.abs(track.samples[best]!.curvature) ? i : best),
  0,
);

describe('locateOnTrack', () => {
  it('measures the signed lateral offset (positive = right)', () => {
    const i = locateOnTrack(track, vec2(0, 0)).index;
    expect(locateOnTrack(track, beside(i, 3)).lateral).toBeCloseTo(3, 1);
    expect(locateOnTrack(track, beside(i, -4)).lateral).toBeCloseTo(-4, 1);
  });

  it('still answers far away from the track', () => {
    expect(locateOnTrack(track, vec2(5000, 5000)).index).toBeGreaterThanOrEqual(0);
  });
});

describe('surfaceAt', () => {
  const straight = locateOnTrack(track, vec2(0, 0)).index;

  it('is asphalt on the racing surface', () => {
    expect(surfaceAt(track, beside(straight, 0))).toBe('asphalt');
    expect(surfaceAt(track, beside(straight, track.halfWidth - 0.1))).toBe('asphalt');
  });

  it('is grass just off a straight without kerbs', () => {
    expect(surfaceAt(track, beside(straight, track.halfWidth + 2))).toBe('grass');
  });

  it('is kerb at the edge of a corner', () => {
    expect(['kerb', 'highKerb']).toContain(surfaceAt(track, beside(tightest, track.halfWidth)));
  });

  it('is gravel outside the tightest corner', () => {
    const outside = track.samples[tightest]!.curvature > 0 ? -1 : 1;
    expect(surfaceAt(track, beside(tightest, outside * (track.halfWidth + 5)))).toBe('gravel');
  });

  it('has high kerbs somewhere (the chicane)', () => {
    const found = track.samples.some((_, i) =>
      [-1, 1].some((side) => surfaceAt(track, beside(i, side * track.halfWidth)) === 'highKerb'),
    );
    expect(found).toBe(true);
  });
});

describe('gridSlot', () => {
  it('places slots behind the start line, on asphalt, not overlapping', () => {
    const slots = [0, 1, 2, 3].map((slot) => gridSlot(track, slot));
    for (const { position } of slots) {
      expect(surfaceAt(track, position)).toBe('asphalt');
      expect(locateOnTrack(track, position).distance).toBeGreaterThan(track.length - 50);
    }
    for (let a = 0; a < slots.length; a++) {
      for (let b = a + 1; b < slots.length; b++) {
        expect(distance(slots[a]!.position, slots[b]!.position)).toBeGreaterThan(4);
      }
    }
  });
});
