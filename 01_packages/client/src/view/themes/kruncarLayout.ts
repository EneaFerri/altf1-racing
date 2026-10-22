import { KRUNCAR, vec2, type TrackSide, type Vec2 } from '@altf1/shared';
import type { Circle } from '../scenery/placement';

// Where Kruncar's scenery stands, as plain data (no Three.js), so tests can check it against the
// track. Coordinates in metres, same axes as the track (see kruncar.ts). Notes in 01_docs/themes.md.

/** Control point `i` of the Kruncar layout. */
const point = (i: number): Vec2 => KRUNCAR.points[i]!.at;

/** A river: water `width` wide along `path`, ending in a pond. Crosses the track only at bridges. */
export interface River {
  readonly path: readonly Vec2[];
  readonly width: number;
  readonly pond: Circle;
}

export const KRUNCAR_RIVERS: readonly River[] = [
  // Under the plank bridge (point 17's straight), from the east into a pond in the infield.
  {
    path: [vec2(1400, -300), vec2(400, -300), vec2(215.5, -300), vec2(165, -285), vec2(128, -190)],
    width: 16,
    pond: { x: 110, z: -160, r: 26 },
  },
  // From the south: under a plank bridge on the wide road, then under the covered bridge on the
  // zigzag shortcut, into a pond north of it.
  {
    path: [
      vec2(272, 1400),
      vec2(272, 400),
      vec2(272, 289.3),
      vec2(266, 235),
      vec2(247.3, 174.2),
      vec2(215, 135),
    ],
    width: 14,
    pond: { x: 190, z: 108, r: 25 },
  },
  // Under the bridge just before the finish (between points 60 and 61), from the west.
  {
    path: [vec2(-1400, 110), vec2(-200, 112), vec2(0, 110), vec2(60, 116), vec2(100, 130)],
    width: 14,
    pond: { x: 128, z: 145, r: 28 },
  },
];

/** Where a river crosses the track: a bridge `length` metres long centred there. */
export interface Bridge {
  readonly at: Vec2;
  readonly length: number;
  /** Covered (barn-like roof) or open (plank deck and railings only). */
  readonly covered: boolean;
}

export const KRUNCAR_BRIDGES: readonly Bridge[] = [
  { at: vec2(215.5, -300), length: 36, covered: false },
  { at: vec2(272, 289.3), length: 30, covered: false },
  { at: vec2(247.3, 174.2), length: 30, covered: true },
  { at: vec2(0, 110), length: 30, covered: false },
];

/** Grandstands along the main straight: beside control point `near`, `along` m further on. */
export interface Stand {
  readonly near: Vec2;
  readonly side: TrackSide;
  readonly along: number;
  readonly length: number;
}

export const KRUNCAR_STANDS: readonly Stand[] = (['left', 'right'] as const).flatMap((side) => [
  { near: point(0), side, along: 50, length: 80 },
  { near: point(0), side, along: 138, length: 80 },
]);

/** Barn between the barn straight (points 33-35) and the fork, inside the third hairpin. */
export const KRUNCAR_BARN = { position: vec2(425, 36), rotation: 0 } as const;

/** Hay-bale stacks around the second hairpin and along the barn straight. */
export const KRUNCAR_HAY: readonly Vec2[] = [
  vec2(88, -62),
  vec2(84, -30),
  vec2(300, -46),
  vec2(380, -48),
  vec2(330, 38),
];

/**
 * Concrete wall with chain fence (grandstand area) between these control points, wooden fence
 * elsewhere: the main straight, from the finish bridge to the first corner.
 */
export const KRUNCAR_CONCRETE = { fromPoint: 61, toPoint: 2 } as const;
