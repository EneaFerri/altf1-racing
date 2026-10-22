import { vec2 } from '../../math/vec2';
import type { TrackDefinition, TrackPoint } from '../types';

const p = (x: number, z: number, width: number): TrackPoint => ({ at: vec2(x, z), width });

/**
 * Kruncar (~2.56 km, clockwise seen from above): inspired by the Krunker.io map "KrunCar" by Keybi,
 * its sequence of corners as the owner drives it, scaled to our widths and speeds (not a 1:1 copy).
 * Near the end the road forks: a wide road with two comfortable corners (main loop) or a narrow
 * wooden zigzag shortcut (the branch, 14 m). Sized for a Hard bot lap (shortcut) of about 45 s.
 * Corners are circular arcs, so the spline stays round: keep arc points evenly spaced when editing.
 * Section-by-section notes in 01_docs/track.md.
 */
export const KRUNCAR: TrackDefinition = {
  name: 'Kruncar',
  // Like the Krunker map: pink/white kerbs along every edge, then a few metres of grass to the fence.
  kerbs: 'everywhere',
  runoffWidth: 6,
  points: [
    // 0-2: main straight between the grandstands; start line at point 0
    p(0, 0, 32),
    p(0, -90, 32),
    p(0, -180, 32),
    // 3-9: 90° right, immediately 90° left
    p(6.7, -205, 30),
    p(25, -223.3, 30),
    p(50, -230, 30),
    p(75.5, -230, 30),
    p(100.5, -236.7, 30),
    p(118.8, -255, 30),
    p(125.5, -280, 30),
    // 10-16: straight into the first hairpin (180° right), wide for late braking
    p(125.5, -410, 28),
    p(131.5, -432.5, 32),
    p(148, -449, 32),
    p(170.5, -455, 32),
    p(193, -449, 32),
    p(209.5, -432.5, 32),
    p(215.5, -410, 32),
    // 17: straight over the plank bridge
    p(215.5, -260, 26),
    // 18-22: left, immediately right (S-bend), then a short straight
    p(218.5, -242.9, 26),
    p(227.2, -227.9, 26),
    p(235.9, -212.8, 26),
    p(238.9, -195.7, 26),
    p(238.9, -145.7, 28),
    // 23-26: right, a bit of straight
    p(232.9, -123.2, 28),
    p(216.4, -106.8, 28),
    p(193.9, -100.7, 28),
    p(173.9, -100.7, 28),
    // 27-32: second hairpin (180° left)
    p(151.4, -94.7, 28),
    p(134.9, -78.2, 28),
    p(128.9, -55.7, 28),
    p(134.9, -33.2, 28),
    p(151.4, -16.8, 28),
    p(173.9, -10.7, 28),
    // 33-35: straight along the barn and the hay bales
    p(281.3, -10.7, 28),
    p(388.8, -10.7, 28),
    p(496.2, -10.7, 28),
    // 36-41: third hairpin (180° right)
    p(518.7, -4.7, 32),
    p(535.2, 11.8, 32),
    p(541.2, 34.3, 32),
    p(535.2, 56.8, 32),
    p(518.7, 73.2, 32),
    p(496.2, 79.3, 32),
    // 42-50: the fork. Point 42: the roads split. Main = the wide road: comfortable left, south,
    // comfortable right; the zigzag shortcut is `branches[0]`. Point 50: they join again
    p(426.2, 79.3, 26),
    p(396.2, 87.3, 26),
    p(374.3, 109.3, 26),
    p(366.2, 139.3, 26),
    p(366.2, 229.3, 26),
    p(358.2, 259.3, 26),
    p(336.2, 281.2, 26),
    p(306.2, 289.3, 26),
    p(146.2, 289.3, 26),
    // 51-60: straight, then left, right onto the main straight's line, left
    p(96.2, 289.3, 28),
    p(81.2, 291.6, 28),
    p(67.6, 298.3, 28),
    p(38.9, 308.2, 28),
    p(9.3, 301.4, 28),
    p(-12.1, 279.9, 28),
    p(-18.9, 250.4, 28),
    p(-9, 221.7, 28),
    p(-2.3, 208.1, 28),
    p(0, 193, 28),
    // 61: over the bridge to the line
    p(0, 96.5, 30),
  ],
  highKerbs: [],
  branches: [
    {
      // The wooden zigzag shortcut: straight on where the wide road turns left, then six short
      // legs swinging ±12.5° around the diagonal, onto the main road again at point 50.
      fromPoint: 42,
      toPoint: 50,
      points: [
        p(336.2, 79.3, 14),
        p(301.1, 90.6, 14),
        p(279.3, 120.5, 14),
        p(273.4, 138.2, 14),
        p(270.7, 144.2, 14),
        p(266.7, 149.4, 14),
        p(253.9, 163, 14),
        p(250, 168.2, 14),
        p(247.3, 174.2, 14),
        p(241.4, 191.9, 14),
        p(238.7, 197.9, 14),
        p(234.7, 203.1, 14),
        p(221.9, 216.7, 14),
        p(218, 221.9, 14),
        p(215.3, 227.9, 14),
        p(209.4, 245.6, 14),
        p(206.7, 251.6, 14),
        p(202.7, 256.8, 14),
        p(189.9, 270.4, 14),
        p(170, 284.4, 14),
      ],
    },
  ],
};
