import * as THREE from 'three';
import { TRACK_RULES, type Track, type Vec2 } from '@altf1/shared';
import { createChevronTexture, createHayTexture, createPlankTexture } from '../pixelTexture';
import { ribbon } from '../ribbon';
import { face } from './buildings';
import { cornerApexes, seededRandom } from './placement';

// Things right beside or on the track: corner boards, hay bales, bridge decks.

const Y_DECK = 0.027; // over the asphalt and its edge line, under the kerbs
const PLANK_TILE = 4;
const BOARD_WIDTH = 7;
const BOARD_HEIGHT = 1.75; // keeps the 16×8 chevron texture's pixels square
const BOARD_LIFT = 1;
/** Corners tighter than this (radius under 70 m) get a chevron board. */
const CHEVRON_CURVATURE = 1 / 70;
/** Corners closer than this (m), turning the same way, share one board. */
const CHEVRON_GAP = 60;
/** The board faces the direction cars come from this far before the apex (m). */
const CHEVRON_APPROACH = 30;

/**
 * A red/white chevron board on the outside of every tight corner, beyond the wall, facing the
 * approaching cars, arrows pointing the way the corner turns.
 */
export function createChevronBoards(track: Track): THREE.Group {
  const group = new THREE.Group();
  const n = track.samples.length;
  const post = new THREE.MeshLambertMaterial({ color: '#2c2c30' });
  const right = createChevronTexture();
  const left = createChevronTexture();
  left.wrapS = THREE.RepeatWrapping;
  left.repeat.x = -1; // mirrored: arrows point left
  const materials = {
    right: new THREE.MeshLambertMaterial({ map: right }),
    left: new THREE.MeshLambertMaterial({ map: left }),
  };
  for (const apex of cornerApexes(track, CHEVRON_CURVATURE, CHEVRON_GAP)) {
    const s = track.samples[apex.index]!;
    const before =
      track.samples[(apex.index - Math.round((CHEVRON_APPROACH * n) / track.length) + n) % n]!;
    // Outside of a right turn is the left side (negative normal), and vice versa.
    const k = apex.direction === 'right' ? -1 : 1;
    const offset = k * (s.halfWidth + track.runoffWidth + 2.5);
    const board = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.2), [
      post,
      post,
      post,
      post,
      materials[apex.direction],
      post,
    ]);
    panel.position.y = BOARD_LIFT + BOARD_HEIGHT / 2;
    board.add(panel);
    for (const x of [-BOARD_WIDTH / 2 + 0.3, BOARD_WIDTH / 2 - 0.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, BOARD_LIFT, 0.25), post);
      leg.position.set(x, BOARD_LIFT / 2, 0);
      board.add(leg);
    }
    board.position.set(s.position.x + s.normal.x * offset, 0, s.position.z + s.normal.z * offset);
    face(board, { x: -before.tangent.x, z: -before.tangent.z });
    group.add(board);
  }
  return group;
}

/** Stacks of hay bales (two layers) at each spot, turned at random. */
export function createHayStacks(spots: readonly Vec2[], seed: number): THREE.Group {
  const random = seededRandom(seed);
  const hay = new THREE.MeshLambertMaterial({ map: createHayTexture() });
  const bale = new THREE.BoxGeometry(2.4, 1.2, 1.3);
  const group = new THREE.Group();
  for (const spot of spots) {
    const stack = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const lower = new THREE.Mesh(bale, hay);
      lower.position.set((i - 1.5) * 2.5, 0.6, 0);
      stack.add(lower);
      if (i > 0 && i < 3) {
        const upper = new THREE.Mesh(bale, hay);
        upper.position.set((i - 1.5) * 2.5, 1.8, 0);
        stack.add(upper);
      }
    }
    stack.position.set(spot.x, 0, spot.z);
    stack.rotation.y = random() * Math.PI;
    group.add(stack);
  }
  return group;
}

/**
 * Wooden plank deck drawn over the asphalt of `road` on the segments `include` picks, between the
 * kerbs. View only: the physics still sees asphalt (same grip).
 */
export function createDeck(road: Track, include: (segment: number) => boolean): THREE.Mesh {
  const inner = (halfWidth: number): number => halfWidth - TRACK_RULES.kerbInset;
  return ribbon(
    road,
    (s) => [-inner(s.halfWidth), inner(s.halfWidth)],
    Y_DECK,
    new THREE.MeshLambertMaterial({ map: createPlankTexture(), side: THREE.DoubleSide }),
    PLANK_TILE,
    { include, metresAcross: PLANK_TILE },
  );
}

/** Segments of `road` within `length` / 2 m of distance `centre` along it. */
export function around(road: Track, centre: number, length: number): (segment: number) => boolean {
  return (i) => {
    const d = Math.abs(road.samples[i]!.distance - centre);
    return Math.min(d, road.length - d) <= length / 2;
  };
}
