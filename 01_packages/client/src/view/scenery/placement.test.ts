import { describe, expect, it } from 'vitest';
import { buildTrack, KRUNCAR, locateOnTrack, vec2 } from '@altf1/shared';
import {
  KRUNCAR_BARN,
  KRUNCAR_BRIDGES,
  KRUNCAR_HAY,
  KRUNCAR_RIVERS,
  KRUNCAR_STANDS,
} from '../themes/kruncarLayout';
import {
  besideTrack,
  clearance,
  cornerApexes,
  fitsBeside,
  footprintBox,
  polylineFootprint,
  scatter,
  standPieces,
  trackBounds,
  type TrackSpot,
} from './placement';

const track = buildTrack(KRUNCAR);

describe('placement', () => {
  it('scatters points only outside the walls, apart from each other and from avoided circles', () => {
    const avoid = [{ x: 105, z: -205, r: 40 }];
    const points = scatter(track, 80, trackBounds(track, 100), {
      seed: 1,
      margin: 5,
      spacing: 12,
      avoid,
    });
    expect(points.length).toBe(80);
    for (const p of points) {
      expect(clearance(track, p)).toBeGreaterThanOrEqual(5);
      expect(Math.hypot(p.x - 105, p.z + 205)).toBeGreaterThanOrEqual(40);
    }
    expect(
      scatter(track, 80, trackBounds(track, 100), { seed: 1, margin: 5, spacing: 12 }),
    ).toEqual(scatter(track, 80, trackBounds(track, 100), { seed: 1, margin: 5, spacing: 12 }));
  });

  it('draws a long stand beside a bend in pieces that follow the track, each clear of it', () => {
    const reach = { back: 10, roof: 3 };
    // Half the lap at 3 m beyond the right wall: as one straight box it cuts across the track.
    const spots: TrackSpot[] = [
      [0.1, 3],
      [0.6, 3],
      [0.6, 13],
      [0.1, 13],
    ];
    expect(fitsBeside(track, footprintBox(track, spots), reach)).toBe(false);
    const pieces = standPieces(track, spots, reach, 15);
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThan(30);
      expect(fitsBeside(track, piece, reach)).toBe(true);
    }
  });

  it('puts trackside spots just beyond the wall, facing the track', () => {
    const spot = besideTrack(track, KRUNCAR.points[1]!.at, 'right', 3);
    expect(clearance(track, spot.position)).toBeCloseTo(3, 0);
    // Main straight heads -z, so its right side is +x and the track lies towards -x.
    expect(spot.position.x).toBeGreaterThan(0);
    expect(spot.towardsTrack.x).toBeCloseTo(-1);
  });

  it('finds an apex in every Kruncar hairpin, turning the way the track turns', () => {
    const apexes = cornerApexes(track, 1 / 60, 100);
    const directionsNear = (x: number, z: number) =>
      apexes
        .filter((a) => {
          const s = track.samples[a.index]!.position;
          return Math.hypot(s.x - x, s.z - z) < 70;
        })
        .map((a) => a.direction);
    expect(new Set(directionsNear(170.5, -455))).toEqual(new Set(['right'])); // hairpin 1
    expect(new Set(directionsNear(128.9, -55.7))).toEqual(new Set(['left'])); // hairpin 2
    expect(new Set(directionsNear(541.2, 34.3))).toEqual(new Set(['right'])); // hairpin 3
  });
});

describe('Kruncar scenery layout', () => {
  it('keeps rivers off the track except under the bridges', () => {
    for (const river of KRUNCAR_RIVERS) {
      for (const c of polylineFootprint(river.path, river.width / 2, 2)) {
        const onTrack = clearance(track, vec2(c.x, c.z)) < river.width / 2;
        // Under a bridge: within the track's width, run-off and the river's own width of it.
        const reach = track.maxHalfWidth + track.runoffWidth + river.width;
        const underBridge = KRUNCAR_BRIDGES.some(
          (b) => Math.hypot(c.x - b.at.x, c.z - b.at.z) < reach,
        );
        if (onTrack) expect(underBridge).toBe(true);
      }
      expect(clearance(track, vec2(river.pond.x, river.pond.z))).toBeGreaterThan(river.pond.r + 4);
    }
  });

  it('builds every bridge right on the track', () => {
    for (const bridge of KRUNCAR_BRIDGES) {
      expect(Math.abs(locateOnTrack(track, bridge.at).lateral)).toBeLessThan(2);
    }
  });

  it('keeps the barn, the hay and the grandstands clear of the walls', () => {
    expect(clearance(track, KRUNCAR_BARN.position)).toBeGreaterThan(14);
    for (const hay of KRUNCAR_HAY) expect(clearance(track, hay)).toBeGreaterThan(3);
    for (const stand of KRUNCAR_STANDS) {
      for (const along of [-stand.length / 2, 0, stand.length / 2]) {
        const spot = besideTrack(track, stand.near, stand.side, 3, stand.along + along);
        expect(clearance(track, spot.position)).toBeGreaterThan(2);
      }
    }
  });
});
