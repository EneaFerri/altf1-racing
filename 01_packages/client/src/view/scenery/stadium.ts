import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createConcreteTexture, createCrowdTexture } from '../pixelTexture';
import { face } from './buildings';
import type { Footprint } from './placement';

// The bowl of a stadium the track runs through (Mexico City's Foro Sol): tall stepped stands
// along its OSM outline, facing the field, left out where the track passes (placement:
// `bowlPieces`). Built like a grandstand: +Z faces the field, origin at the front centre.

const ROW_DEPTH = 1.2;
const ROW_RISE = 0.8;
const ROWS = 18;
/** Back wall above the top row (m). */
const PARAPET = 2.5;

/** How far a bowl stand reaches behind its front (m); nothing reaches in front. */
export const BOWL_REACH = { back: ROWS * ROW_DEPTH + 0.6, roof: 0 } as const;
/** Bowl stands are drawn in pieces this long at most (m). */
export const BOWL_PIECE = 15;

/** The bowl: one stand on every piece, its rows merged into one mesh. */
export function createStadium(pieces: readonly Footprint[]): THREE.Group {
  const group = new THREE.Group();
  const top = ROWS * ROW_RISE + PARAPET;
  for (const piece of pieces) {
    const rows = mergeGeometries(
      Array.from({ length: ROWS }, (_, row) => {
        const height = (row + 1) * ROW_RISE;
        const step = new THREE.BoxGeometry(piece.length, height, ROW_DEPTH);
        step.translate(0, height / 2, -(row + 0.5) * ROW_DEPTH);
        return step;
      }),
    );
    const crowd = createCrowdTexture();
    crowd.repeat.set(piece.length / 4, 1);
    const concrete = createConcreteTexture();
    concrete.repeat.set(piece.length / 4, top / 4);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(piece.length, top, 0.6),
      new THREE.MeshLambertMaterial({ map: concrete }),
    );
    back.position.set(0, top / 2, -BOWL_REACH.back + 0.3);
    const stand = new THREE.Group();
    stand.add(new THREE.Mesh(rows, new THREE.MeshLambertMaterial({ map: crowd })), back);
    stand.position.set(piece.front.x, 0, piece.front.z);
    face(stand, piece.towardsTrack);
    group.add(stand);
  }
  return group;
}
