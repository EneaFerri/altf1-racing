import { describe, expect, it } from 'vitest';
import { distance, dot, normalize, sub } from '../math/vec2';
import { TRACK_RULES } from '../config/track';
import { buildTrack } from './buildTrack';
import { KRUNCAR } from './layouts/kruncar';
import { TEST_TRACK, TRACKS } from './layouts';
import type { Track } from './types';

/** Kerb sides on a sample that has high kerbs. */
function highKerbs(track: Track) {
  return track.samples.flatMap((s, i) =>
    (['left', 'right'] as const)
      .filter((side) => track.sides[side].kerb[i] === 'high')
      .map((side) => ({ s, side })),
  );
}

describe.each(TRACKS.map((definition) => [definition.name, definition] as const))(
  'buildTrack: every track (%s)',
  (_name, definition) => {
    const track = buildTrack(definition);
    const n = track.samples.length;

    it('is a closed loop', () => {
      expect(distance(track.samples[n - 1]!.position, track.samples[0]!.position)).toBeLessThan(
        2.5,
      );
    });

    it('is never narrower than the minimum width, and the width varies', () => {
      const widths = track.samples.map((s) => s.halfWidth * 2);
      expect(Math.min(...widths)).toBeGreaterThanOrEqual(TRACK_RULES.minWidth - 1e-9);
      expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) + 4);
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

    it('puts kerbs in corners, and on the main straight only on tracks with kerbs everywhere', () => {
      const straight = Math.round((60 * n) / track.length);
      const expected = definition.kerbs === 'everywhere' ? 'low' : 'none';
      expect(track.sides.left.kerb[straight]).toBe(expected);
      expect(track.sides.right.kerb[straight]).toBe(expected);

      const tightest = track.samples.reduce(
        (best, s, i) =>
          Math.abs(s.curvature) > Math.abs(track.samples[best]!.curvature) ? i : best,
        0,
      );
      expect(track.sides.left.kerb[tightest]).not.toBe('none');
      expect(track.sides.right.kerb[tightest]).not.toBe('none');
    });

    it('puts high kerbs only on the inside of corners', () => {
      for (const { s, side } of highKerbs(track)) {
        expect(side).toBe(s.curvature > 0 ? 'right' : 'left');
      }
    });
  },
);

describe('buildTrack (test track)', () => {
  const track = buildTrack(TEST_TRACK);

  it('is about 2 km long', () => {
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2200);
  });

  it('rejects a definition narrower than the minimum width', () => {
    const narrow = { ...TEST_TRACK, points: TEST_TRACK.points.map((p) => ({ ...p, width: 12 })) };
    expect(() => buildTrack(narrow)).toThrow(/minimum/);
  });

  it('places high kerbs only in the chicane', () => {
    const highs = highKerbs(track);
    expect(highs.length).toBeGreaterThan(5);
    for (const { s } of highs) {
      // Chicane: control points 8-11.
      expect(s.position.z).toBeGreaterThan(-175);
      expect(s.position.z).toBeLessThan(-20);
    }
  });
});

describe('buildTrack (Kruncar)', () => {
  const track = buildTrack(KRUNCAR);

  it('is about 2.5 km long', () => {
    expect(track.length).toBeGreaterThan(2400);
    expect(track.length).toBeLessThan(2600);
  });

  it('is narrowest, with high kerbs, only in the wooden section', () => {
    const highs = highKerbs(track);
    expect(highs.length).toBeGreaterThan(20);
    // Wooden section: control points 43-55, x 198-366 and z 130-298.
    for (const { s } of highs) {
      expect(s.position.x).toBeGreaterThan(190);
      expect(s.position.x).toBeLessThan(375);
      expect(s.position.z).toBeGreaterThan(120);
      expect(s.position.z).toBeLessThan(305);
    }
    const narrow = track.samples.filter((s) => s.halfWidth * 2 < 25);
    for (const s of narrow) expect(s.position.z).toBeGreaterThan(120);
  });
});
