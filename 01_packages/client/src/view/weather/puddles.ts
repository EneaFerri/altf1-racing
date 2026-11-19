import * as THREE from 'three';
import { add, locateOnTrack, scale, type Puddle, type Track } from '@altf1/shared';
import { createPuddleTexture } from '../pixelTexture';
import { Y_PUDDLE } from '../TrackView';

/** Each puddle is drawn as a grid of this many cells a side: enough to follow a sloped road. */
const CELLS = 2;

/**
 * The puddles of a wet track (`placePuddles`, the ones the simulation feels), one mesh for all:
 * flat pixel blobs on the asphalt, at the road's height on an elevated track. Unlit: SceneView
 * tints them with the sky's colour, so they mirror it.
 */
export function createPuddles(track: Track, puddles: readonly Puddle[]): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const side = CELLS + 1;
  for (const p of puddles) {
    const first = positions.length / 3;
    for (let j = 0; j <= CELLS; j++) {
      for (let i = 0; i <= CELLS; i++) {
        const [u, v] = [i / CELLS, j / CELLS];
        const at = add(
          p.center,
          add(
            scale(p.axis, (u * 2 - 1) * p.halfLength),
            scale(p.normal, (v * 2 - 1) * p.halfWidth),
          ),
        );
        const y = track.elevated ? locateOnTrack(track, at).height : 0;
        positions.push(at.x, y + Y_PUDDLE, at.z);
        uvs.push(u, v);
      }
    }
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const a = first + j * side + i;
        index.push(a, a + side, a + 1, a + 1, a + side, a + side + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({
    map: createPuddleTexture(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}
