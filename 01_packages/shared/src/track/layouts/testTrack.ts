import { vec2, type Vec2 } from '../../math/vec2';
import type { TrackDefinition } from '../types';

/** Layout was sketched at a slightly smaller size; scaling keeps the shape and hits ~1.5 km. */
const SCALE = 1.1;
const p = (x: number, z: number): Vec2 => vec2(x * SCALE, z * SCALE);

/**
 * Short test circuit (~1.5 km, clockwise seen from above). Point indices are referenced by
 * `highKerbs`, so keep comments in sync when editing. Layout notes in 01_docs/track.md.
 */
export const TEST_TRACK: TrackDefinition = {
  name: 'Test Ring',
  halfWidth: 6,
  runoffWidth: 10,
  points: [
    // 0-2: main straight, start line at point 0
    p(0, 180),
    p(0, 0),
    p(0, -200),
    // 3-6: hairpin, a semicircle of radius ~27 (heavy braking, gravel outside)
    p(8, -224),
    p(27, -232),
    p(46, -224),
    p(54, -205),
    // 7-10: short run, then fast chicane (high kerbs inside)
    p(54, -130),
    p(54, -100),
    p(70, -70),
    p(70, -40),
    // 11-13: fast left sweeper onto the back section
    p(74, 0),
    p(100, 26),
    p(135, 32),
    // 14-19: long double-apex right (the drift showcase)
    p(185, 32),
    p(222, 52),
    p(238, 92),
    p(238, 150),
    p(226, 200),
    p(190, 232),
    // 20-22: fast kink, flat out
    p(140, 244),
    p(100, 240),
    p(60, 248),
    // 23-24: medium 90° right back onto the straight
    p(22, 252),
    p(2, 228),
  ],
  highKerbs: [{ fromPoint: 8, toPoint: 10 }],
};
