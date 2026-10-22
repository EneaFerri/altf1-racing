import { vec2 } from '../../math/vec2';
import type { TrackDefinition, TrackPoint } from '../types';

const p = (x: number, z: number, width: number): TrackPoint => ({ at: vec2(x, z), width });

/**
 * Test circuit (~2 km, clockwise seen from above), designed for 24–32 m of asphalt.
 * Point indices are referenced by `highKerbs`: keep the comments in sync when editing.
 * Section-by-section notes in 01_docs/track.md.
 */
export const TEST_TRACK: TrackDefinition = {
  name: 'Test Ring',
  runoffWidth: 10,
  points: [
    // 0-2: main straight, widest part; start line at point 0
    p(0, 180, 32),
    p(0, -60, 32),
    p(0, -290, 32),
    // 3-6: hairpin, wide entry for late-braking overtakes, gravel outside
    p(13, -330, 30),
    p(45, -345, 30),
    p(77, -330, 30),
    p(90, -290, 28),
    // 7-11: short run into the fast chicane, the narrowest part (high kerbs inside)
    p(90, -200, 26),
    p(95, -160, 24),
    p(118, -125, 24),
    p(128, -85, 24),
    p(130, -30, 26),
    // 12-15: fast left sweeper onto the back straight
    p(142, 22, 28),
    p(178, 55, 28),
    p(230, 64, 28),
    p(320, 64, 28),
    // 16-21: long double-apex right
    p(378, 80, 28),
    p(410, 125, 28),
    p(416, 190, 28),
    p(405, 250, 28),
    p(375, 292, 28),
    p(330, 312, 28),
    // 22-24: fast kink, flat out
    p(270, 316, 26),
    p(220, 304, 26),
    p(160, 318, 26),
    // 25-27: medium right back onto the main straight
    p(60, 320, 28),
    p(20, 305, 28),
    p(2, 268, 30),
  ],
  highKerbs: [{ fromPoint: 8, toPoint: 11 }],
};
