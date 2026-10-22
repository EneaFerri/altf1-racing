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
  // Under the plank bridge (points 18-19), from the east into a pond in the infield.
  {
    path: [vec2(1400, -300), vec2(400, -300), vec2(215, -300), vec2(150, -294), vec2(115, -260)],
    width: 16,
    pond: { x: 105, z: -205, r: 40 },
  },
  // Under the covered bridge in the wooden section (between points 49 and 50), from the south.
  {
    path: [vec2(272, 1400), vec2(272, 400), vec2(271, 216), vec2(264, 175)],
    width: 14,
    pond: { x: 252, z: 128, r: 32 },
  },
  // Under the bridge just before the finish (point 66), from the west.
  {
    path: [vec2(-1400, 110), vec2(-200, 112), vec2(0, 110), vec2(60, 116), vec2(100, 130)],
    width: 14,
    pond: { x: 128, z: 140, r: 30 },
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
  { at: vec2(271.5, 216.6), length: 30, covered: true },
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
  { near: point(0), side, along: 70, length: 100 },
  { near: point(0), side, along: 190, length: 100 },
]);

/** Barn beside the barn straight (points 35-36), on the infield side. */
export const KRUNCAR_BARN = { position: vec2(326, 92), rotation: 0.15 } as const;

/** Hay-bale stacks around the second hairpin and the barn straight. */
export const KRUNCAR_HAY: readonly Vec2[] = [
  vec2(215, -5),
  vec2(240, -2),
  vec2(80, -10),
  vec2(300, 8),
  vec2(170, 92),
];

/**
 * Concrete wall with chain fence (grandstand area) between these distances along the track, wooden
 * fence elsewhere. The main straight runs from the finish bridge to the first corner (point 3).
 */
export const KRUNCAR_CONCRETE = { fromPoint: 66, toPoint: 3 } as const;
