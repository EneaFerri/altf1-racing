import * as THREE from 'three';
import type { Vec2 } from '@altf1/shared';
import type { Footprint } from './placement';

// Props built on flat ground (y = 0) stood on an elevated track's ground (Phase 3: Monaco v2;
// 01_docs/elevation.md). Only used where the track is elevated: flat tracks never pass here.

/** The ground's height at a point, as drawn. */
export type Ground = (p: Vec2) => number;

/** The lowest ground under some points: a building stands there, never floating on a slope. */
export function lowestGround(ground: Ground, points: readonly Vec2[]): number {
  return Math.min(...points.map(ground));
}

/** The four corners of a footprint box (its front on the side towards the track). */
export function boxCorners(box: Footprint): Vec2[] {
  const t = box.towardsTrack;
  const along = { x: -t.z, z: t.x };
  const back = { x: box.front.x - t.x * box.depth, z: box.front.z - t.z * box.depth };
  const half = box.length / 2;
  return [box.front, back].flatMap((p) =>
    [-half, half].map((a) => ({ x: p.x + along.x * a, z: p.z + along.z * a })),
  );
}

/**
 * Every vertex of every mesh in `object` (built flat, in world coordinates) raised by the ground
 * under it: the pit lane, pools, parapets follow the slope.
 */
export function drape(object: THREE.Object3D, ground: Ground): THREE.Object3D {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) return;
    const positions = node.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) + ground({ x: positions.getX(i), z: positions.getZ(i) }));
    }
    positions.needsUpdate = true;
    node.geometry.computeBoundingSphere();
    node.geometry.computeBoundingBox();
  });
  return object;
}

/** Every instance of the instanced meshes in `object` (trees, palms) raised onto the ground. */
export function liftInstances(object: THREE.Object3D, ground: Ground): THREE.Object3D {
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  object.traverse((node) => {
    if (!(node instanceof THREE.InstancedMesh)) return;
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      m.setPosition(p.x, p.y + ground({ x: p.x, z: p.z }), p.z);
      node.setMatrixAt(i, m);
    }
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
  });
  return object;
}
