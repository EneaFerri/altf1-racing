import { describe, expect, it } from 'vitest';
import { distance, dot, normalize, sub } from '../math/vec2';
import { TRACK_RULES } from '../config/track';
import { buildTrack } from './buildTrack';
import { GP_TRACKS, TEST_TRACK } from './layouts';
import { locateOnLoop, locateOnTrack, roadOf } from './query';
import type { Track } from './types';
import type { Vec2 } from '../math/vec2';

/** Kerb sides on a sample that has high kerbs. */
function highKerbs(track: Track) {
  return track.samples.flatMap((s, i) =>
    (['left', 'right'] as const)
      .filter((side) => track.sides[side].kerb[i] === 'high')
      .map((side) => ({ s, side })),
  );
}

describe.each(
  [TEST_TRACK, ...GP_TRACKS].map((definition) => [definition.name, definition] as const),
)('buildTrack: every track (%s)', (_name, definition) => {
  const track = buildTrack(definition);
  const n = track.samples.length;

  it('is a closed loop', () => {
    expect(distance(track.samples[n - 1]!.position, track.samples[0]!.position)).toBeLessThan(2.5);
  });

  it('is never narrower than its minimum width, and the width varies', () => {
    const widths = track.samples.map((s) => s.halfWidth * 2);
    const minWidth = definition.minWidth ?? TRACK_RULES.minWidth;
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(minWidth - 1e-9);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) + 2);
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
      (best, s, i) => (Math.abs(s.curvature) > Math.abs(track.samples[best]!.curvature) ? i : best),
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

  // Real circuits (they declare their own minimum width): only normal kerbs, wider (owner's rule).
  it.runIf(definition.minWidth !== undefined)('has only normal, wide kerbs (real circuit)', () => {
    expect(highKerbs(track)).toHaveLength(0);
    expect(track.kerbOutset).toBeGreaterThan(TRACK_RULES.kerbOutset);
    expect(track.kerbInset).toBeGreaterThan(TRACK_RULES.kerbInset);
  });
});

describe('buildTrack (test track)', () => {
  const track = buildTrack(TEST_TRACK);

  it('is about 2 km long', () => {
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2200);
  });

  it('rejects a definition narrower than the minimum width', () => {
    const narrow = { ...TEST_TRACK, points: TEST_TRACK.points.map((p) => ({ ...p, width: 12 })) };
    expect(() => buildTrack(narrow)).toThrow(/minimum/);
    // A real circuit declares its own minimum.
    expect(() => buildTrack({ ...narrow, minWidth: 12 })).not.toThrow();
  });

  it('splits the lap into equal sectors unless the track places them', () => {
    const third = track.length / TRACK_RULES.sectorCount;
    expect(track.sectorStarts).toEqual([0, third, 2 * third]);
    const placed = buildTrack({ ...TEST_TRACK, sectorPoints: [3, 16] });
    const at = (point: number) => locateOnTrack(placed, TEST_TRACK.points[point]!.at).distance;
    expect(placed.sectorStarts[0]).toBe(0);
    // Within one sample of the control point.
    expect(Math.abs(placed.sectorStarts[1]! - at(3))).toBeLessThan(TRACK_RULES.sampleSpacing);
    expect(Math.abs(placed.sectorStarts[2]! - at(16))).toBeLessThan(TRACK_RULES.sampleSpacing);
    expect(() => buildTrack({ ...TEST_TRACK, sectorPoints: [16, 3] })).toThrow(/sectorPoints/);
    expect(() => buildTrack({ ...TEST_TRACK, sectorPoints: [3] })).toThrow(/sectorPoints/);
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

describe('buildTrack — heights (Phase 3)', () => {
  it('leaves a track without heights flat: no elevation, height and grade 0 everywhere', () => {
    for (const definition of [TEST_TRACK, ...GP_TRACKS].filter(
      (d) => d.points[0]!.height === undefined,
    )) {
      const track = buildTrack(definition);
      expect(track.elevated).toBe(false);
      expect(track.samples.every((s) => s.height === 0 && s.grade === 0)).toBe(true);
    }
  });

  it("passes through the points' heights, the grade + uphill and − downhill", () => {
    // The Test Ring climbing 20 m over its first half and back down over the second.
    const n = TEST_TRACK.points.length;
    const height = (i: number): number => 20 * Math.sin((Math.PI * i) / n) ** 2;
    const hilly = {
      ...TEST_TRACK,
      points: TEST_TRACK.points.map((p, i) => ({ ...p, height: height(i) })),
    };
    const track = buildTrack(hilly);
    expect(track.elevated).toBe(true);
    const near = (i: number) =>
      track.samples.reduce((a, b) =>
        distance(b.position, hilly.points[i]!.at) < distance(a.position, hilly.points[i]!.at)
          ? b
          : a,
      );
    for (const i of [0, Math.round(n / 4), Math.round(n / 2)]) {
      expect(near(i).height).toBeCloseTo(height(i), 0);
    }
    expect(near(Math.round(n / 4)).grade).toBeGreaterThan(0);
    expect(near(Math.round((3 * n) / 4)).grade).toBeLessThan(0);
    const loc = locateOnTrack(track, near(Math.round(n / 4)).position);
    expect(loc.height).toBeCloseTo(near(Math.round(n / 4)).height, 1);
    expect(loc.grade).toBeGreaterThan(0);
  });
});

/** Whether segments ab and cd cross. */
function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const side = (p: Vec2, q: Vec2, r: Vec2): number =>
    Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}

describe('buildTrack: the pit lane (Phase 4)', () => {
  it('is built only when asked for, and only where the data has one', () => {
    expect(buildTrack(GP_TRACKS[0]!).routes.some((route) => route.pit)).toBe(false);
    expect(() => buildTrack(TEST_TRACK, { pitLane: true })).toThrow(/no pit lane/);
  });

  describe.each(GP_TRACKS.map((definition) => [definition.name, definition] as const))(
    '%s',
    (_name, definition) => {
      const plain = buildTrack(definition);
      const track = buildTrack(definition, { pitLane: true });
      const pit = track.routes.findIndex((route) => route.pit);
      const road = track.routes[pit]!;
      // The lane's centreline, from where it leaves the track to where it rejoins it.
      const lane = [
        ...road.samples.filter((s) => s.distance >= road.branch!.from).map((s) => s.position),
        road.samples[0]!.position,
      ];

      it('leaves the main loop as it was', () => {
        expect(track.samples).toEqual(plain.samples);
        expect(track.length).toBe(plain.length);
      });

      it('is open from the track to the track: no wall across the lane or the main loop', () => {
        const across = (path: readonly Vec2[]): number =>
          path
            .slice(1)
            .reduce(
              (n, b, i) => n + track.walls.filter((w) => crosses(path[i]!, b, w.a, w.b)).length,
              0,
            );
        expect(across(lane)).toBe(0);
        expect(across(track.samples.map((s) => s.position))).toBe(0);
        // It has walls of its own (the pit wall, the garages' side), without kerbs.
        expect(track.walls.some((w) => w.route === pit)).toBe(true);
        const kerbs = (['left', 'right'] as const).flatMap((side) =>
          road.sides[side].kerb.filter(
            (k, i) => k !== 'none' && road.samples[i]!.distance >= road.branch!.from,
          ),
        );
        expect(kerbs).toEqual([]);
      });

      it('has walls that never fold back (no turn tighter than its half-width)', () => {
        const folded = track.walls.filter((w) => {
          if (w.route !== pit) return false;
          const { tangent } = road.samples[w.sample]!;
          return (w.b.x - w.a.x) * tangent.x + (w.b.z - w.a.z) * tangent.z < 0;
        });
        expect(folded).toEqual([]);
      });

      it('never takes the asphalt of the track itself', () => {
        for (const s of track.samples) {
          expect(locateOnTrack(track, s.position).route).toBe(-1);
        }
      });

      it('locates cars on it, with progress going forward (over the line too)', () => {
        const located = lane.map((p) => locateOnTrack(track, p));
        // Off the track's asphalt every point of the lane is on it (on the asphalt: the track).
        const offTrack = lane.filter((p) => {
          const main = locateOnLoop(track, p);
          return Math.abs(main.lateral) > main.halfWidth;
        });
        expect(offTrack.length / lane.length).toBeGreaterThan(0.8);
        expect(offTrack.every((p) => locateOnTrack(track, p).route === pit)).toBe(true);
        located.slice(1).forEach((loc, i) => {
          const step = (loc.distance - located[i]!.distance + 1.5 * track.length) % track.length;
          expect(step - track.length / 2).toBeGreaterThan(-0.5);
        });
      });
    },
  );
});
