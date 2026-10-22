import { vec2 } from '../../math/vec2';
import type { TrackDefinition, TrackPoint } from '../types';

const p = (x: number, z: number, width: number): TrackPoint => ({ at: vec2(x, z), width });

/**
 * Kruncar (~2.56 km, clockwise seen from above): inspired by the Krunker.io map "KrunCar" by Keybi,
 * its sequence of corners as the owner drives it, scaled to our widths and speeds (not a 1:1 copy).
 * Sized for a Hard bot lap of about 45 s. Corners are circular arcs sampled every 30°, so the spline
 * stays round: keep that spacing when editing. Point indices are referenced by `highKerbs`: keep the
 * comments in sync. Section-by-section notes in 01_docs/track.md.
 */
export const KRUNCAR: TrackDefinition = {
  name: 'Kruncar',
  // Like the Krunker map: pink/white kerbs along every edge, then a few metres of grass to the fence.
  kerbs: 'everywhere',
  runoffWidth: 6,
  points: [
    // 0-3: main straight between the grandstands; start line at point 0
    p(0, 0, 32),
    p(0, -102, 32),
    p(0, -204, 32),
    p(0, -306, 32),
    // 4-10: 90° right, immediately 90° left
    p(6.7, -331, 30),
    p(25, -349.3, 30),
    p(50, -356, 30),
    p(75.5, -356, 30),
    p(100.5, -362.7, 30),
    p(118.8, -381, 30),
    p(125.5, -406, 30),
    // 11-17: short straight into the first hairpin (180° right), wide for late braking
    p(125.5, -499.5, 28),
    p(131.5, -522, 32),
    p(148, -538.5, 32),
    p(170.5, -544.5, 32),
    p(193, -538.5, 32),
    p(209.5, -522, 32),
    p(215.5, -499.5, 32),
    // 18-19: straight over the plank bridge
    p(215.5, -372, 26),
    p(215.5, -244.5, 26),
    // 20-24: left, immediately right (S-bend), then a short straight
    p(218.5, -227.4, 26),
    p(227.2, -212.4, 26),
    p(235.9, -197.3, 26),
    p(238.9, -180.2, 26),
    p(238.9, -95.2, 28),
    // 25-28: right, a bit of straight
    p(232.9, -72.7, 28),
    p(216.4, -56.3, 28),
    p(193.9, -50.2, 28),
    p(159.9, -50.2, 28),
    // 29-34: second hairpin (180° left)
    p(137.4, -44.2, 28),
    p(120.9, -27.7, 28),
    p(114.9, -5.2, 28),
    p(120.9, 17.3, 28),
    p(137.4, 33.7, 28),
    p(159.9, 39.8, 28),
    // 35-36: straight along the barn and the hay bales
    p(275.8, 39.8, 28),
    p(391.7, 39.8, 28),
    // 37-42: third hairpin (180° right)
    p(414.2, 45.8, 30),
    p(430.7, 62.3, 30),
    p(436.7, 84.8, 30),
    p(430.7, 107.3, 30),
    p(414.2, 123.7, 30),
    p(391.7, 129.8, 30),
    // 43-55: the wooden section, narrowest and hardest: left-right steps, high kerbs inside
    p(366.2, 129.8, 24),
    p(345.2, 135.4, 24),
    p(329.9, 150.8, 24),
    p(324.2, 171.8, 24),
    p(318.6, 192.8, 24),
    p(303.2, 208.2, 24),
    p(282.2, 213.8, 24),
    p(261.2, 219.4, 24),
    p(245.9, 234.8, 24),
    p(240.2, 255.8, 24),
    p(234.6, 276.8, 24),
    p(219.2, 292.2, 24),
    p(198.2, 297.8, 24),
    // 56-65: straight, then left, right onto the main straight's line, left
    p(96.2, 297.8, 28),
    p(81.2, 300.1, 28),
    p(67.6, 306.8, 28),
    p(38.9, 316.7, 28),
    p(9.3, 309.9, 28),
    p(-12.1, 288.4, 28),
    p(-18.9, 258.9, 28),
    p(-9, 230.2, 28),
    p(-2.3, 216.6, 28),
    p(0, 201.5, 28),
    // 66: over the bridge to the line
    p(0, 100.8, 30),
  ],
  highKerbs: [{ fromPoint: 43, toPoint: 55 }],
};
