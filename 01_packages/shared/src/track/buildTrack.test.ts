import { describe, expect, it } from 'vitest';
import { distance, dot, normalize, sub, vec2 } from '../math/vec2';
import { buildTrack } from './buildTrack';
import { TEST_TRACK } from './layouts/testTrack';
import { locateOnTrack } from './query';

const track = buildTrack(TEST_TRACK);
const n = track.samples.length;

describe('buildTrack (test track)', () => {
  it('is a closed loop of about 1.5 km', () => {
    expect(track.length).toBeGreaterThan(1350);
    expect(track.length).toBeLessThan(1650);
    expect(distance(track.samples[n - 1]!.position, track.samples[0]!.position)).toBeLessThan(2.5);
  });

  it('has walls that never fold back on themselves', () => {
    track.walls.forEach((wall, i) => {
      const direction = normalize(sub(wall.b, wall.a));
      expect(dot(direction, track.samples[i % n]!.tangent)).toBeGreaterThan(0);
    });
  });

  it('keeps distant parts of the circuit far enough apart that their run-offs never overlap', () => {
    const clearance = 2 * (track.halfWidth + track.runoffWidth);
    for (let i = 0; i < n; i += 2) {
      for (let j = i + 1; j < n; j += 2) {
        const along = Math.abs(track.samples[i]!.distance - track.samples[j]!.distance);
        if (Math.min(along, track.length - along) < 100) continue;
        expect(distance(track.samples[i]!.position, track.samples[j]!.position)).toBeGreaterThan(
          clearance,
        );
      }
    }
  });

  it('puts kerbs in corners and none on the main straight', () => {
    const straight = locateOnTrack(track, vec2(0, 0)).index;
    expect(track.sides.left.kerb[straight]).toBe('none');
    expect(track.sides.right.kerb[straight]).toBe('none');

    const tightest = track.samples.reduce(
      (best, s, i) => (Math.abs(s.curvature) > Math.abs(track.samples[best]!.curvature) ? i : best),
      0,
    );
    expect(track.sides.left.kerb[tightest]).not.toBe('none');
    expect(track.sides.right.kerb[tightest]).not.toBe('none');
  });

  it('places high kerbs only in the chicane, on the inside', () => {
    const highs = track.samples.flatMap((s, i) =>
      (['left', 'right'] as const)
        .filter((side) => track.sides[side].kerb[i] === 'high')
        .map((side) => ({ s, side })),
    );
    expect(highs.length).toBeGreaterThan(5);
    for (const { s, side } of highs) {
      expect(s.position.z).toBeGreaterThan(-115 * 1.1);
      expect(s.position.z).toBeLessThan(-35 * 1.1);
      expect(side).toBe(s.curvature > 0 ? 'right' : 'left');
    }
  });
});
