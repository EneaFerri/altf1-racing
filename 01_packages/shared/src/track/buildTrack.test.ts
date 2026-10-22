import { describe, expect, it } from 'vitest';
import { distance, dot, normalize, sub, vec2 } from '../math/vec2';
import { TRACK_RULES } from '../config/track';
import { buildTrack } from './buildTrack';
import { KRUNCAR } from './layouts/kruncar';
import { TEST_TRACK, TRACKS } from './layouts';
import { locateOnTrack, roadOf, surfaceAt } from './query';
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
      for (const wall of track.walls) {
        const direction = normalize(sub(wall.b, wall.a));
        const road = roadOf(track, wall.route);
        expect(dot(direction, road.samples[wall.sample]!.tangent)).toBeGreaterThan(0);
      }
    });

    it('builds every route as a closed loop, at least as wide as its rules allow', () => {
      for (const route of track.routes) {
        const m = route.samples.length;
        expect(distance(route.samples[m - 1]!.position, route.samples[0]!.position)).toBeLessThan(
          2.5,
        );
        const narrowest = Math.min(...route.samples.map((s) => s.halfWidth * 2));
        expect(narrowest).toBeGreaterThanOrEqual(TRACK_RULES.minShortcutWidth - 1e-9);
      }
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

  const shortcut = track.routes[0]!;
  const branch = shortcut.branch!;
  const onShortcut = shortcut.samples.filter(
    (s) => s.distance > branch.from + 40 && s.distance < branch.to - 40,
  );
  /** Metres outside the drivable area (negative = on asphalt or run-off). */
  const outside = (x: number, z: number): number => {
    const loc = locateOnTrack(track, vec2(x, z));
    return Math.abs(loc.lateral) - loc.halfWidth - track.runoffWidth;
  };

  it('forks into a wide road (main loop, ≥ 24 m) and a narrow 14 m shortcut', () => {
    expect(track.routes).toHaveLength(1);
    expect(Math.min(...track.samples.map((s) => s.halfWidth * 2))).toBeGreaterThanOrEqual(24);
    // Past the lead-in, where the width tapers from the wide road's 26 m.
    const zigzag = shortcut.samples.filter(
      (s) => s.distance > branch.from + 95 && s.distance < branch.to - 30,
    );
    expect(zigzag.length).toBeGreaterThan(100);
    for (const s of zigzag) expect(s.halfWidth * 2).toBeCloseTo(14, 0);
    // The shortcut is shorter than the wide road it skips.
    expect(branch.to - branch.from).toBeLessThan(branch.mainTo - branch.mainFrom);
  });

  it('locates cars on the shortcut there, with progress running on between the junctions', () => {
    let last = branch.mainFrom;
    for (const s of onShortcut) {
      const loc = locateOnTrack(track, s.position);
      expect(loc.route).toBe(0);
      expect(loc.distance).toBeGreaterThan(last);
      expect(loc.distance).toBeLessThan(branch.mainTo);
      expect(surfaceAt(track, s.position)).toBe('asphalt');
      last = loc.distance;
    }
  });

  it('walls off the island between the two roads, and only the island', () => {
    expect(outside(310, 200)).toBeGreaterThan(0); // island
    expect(outside(366.2, 200)).toBeLessThan(0); // wide road
    expect(outside(247.3, 174.2)).toBeLessThan(0); // shortcut
    // A wall runs between the island and each road.
    const near = (x: number, z: number) =>
      track.walls.some((w) => Math.hypot(w.a.x - x, w.a.z - z) < 3);
    expect(near(366.2 - 13 - 6, 200)).toBe(true);
  });
});
