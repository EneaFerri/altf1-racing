import { describe, expect, it } from 'vitest';
import { distance, dot, normalize, sub, vec2 } from '../math/vec2';
import { TRACK_RULES } from '../config/track';
import { buildTrack } from './buildTrack';
import { TEST_TRACK } from './layouts/testTrack';
import { locateOnTrack } from './query';

const track = buildTrack(TEST_TRACK);
const n = track.samples.length;

describe('buildTrack (test track)', () => {
  it('is a closed loop of about 2 km', () => {
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2200);
    expect(distance(track.samples[n - 1]!.position, track.samples[0]!.position)).toBeLessThan(2.5);
  });

  it('is never narrower than the minimum width, and the width varies', () => {
    const widths = track.samples.map((s) => s.halfWidth * 2);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(TRACK_RULES.minWidth - 1e-9);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) + 4);
  });

  it('rejects a definition narrower than the minimum width', () => {
    const narrow = { ...TEST_TRACK, points: TEST_TRACK.points.map((p) => ({ ...p, width: 12 })) };
    expect(() => buildTrack(narrow)).toThrow(/minimum/);
  });

  it('has walls that never fold back on themselves', () => {
    track.walls.forEach((wall, i) => {
      const direction = normalize(sub(wall.b, wall.a));
      expect(dot(direction, track.samples[i % n]!.tangent)).toBeGreaterThan(0);
    });
  });

  it('keeps distant parts of the circuit far enough apart that their run-offs never overlap', () => {
    for (let i = 0; i < n; i += 2) {
      for (let j = i + 1; j < n; j += 2) {
        const a = track.samples[i]!;
        const b = track.samples[j]!;
        const along = Math.abs(a.distance - b.distance);
        if (Math.min(along, track.length - along) < 120) continue;
        const clearance = a.halfWidth + b.halfWidth + 2 * track.runoffWidth;
        expect(distance(a.position, b.position)).toBeGreaterThan(clearance);
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
      // Chicane: control points 8-11.
      expect(s.position.z).toBeGreaterThan(-175);
      expect(s.position.z).toBeLessThan(-20);
      expect(side).toBe(s.curvature > 0 ? 'right' : 'left');
    }
  });
});
