import * as THREE from 'three';
import type { Vec2 } from '@altf1/shared';
import { seededRandom, type Floodlight } from './placement';

// A night race's lights (Singapore, Las Vegas; 01_docs/themes.md): no light source per lamp (too
// costly), only emissive lamps that ignore the fog, so they glow even far away. The track itself
// is lit by the theme's bright global light.

/** Pole height and how far its arm reaches over the wall (m). */
const POLE_HEIGHT = 10;
const ARM = 2.5;

/**
 * Floodlight poles (instanced): a grey pole behind the wall, an arm out towards the track and a
 * warm-white lamp under its end.
 */
export function createFloodlights(spots: readonly Floodlight[]): THREE.Group {
  const metal = new THREE.MeshLambertMaterial({ color: '#59606b', flatShading: true });
  const pole = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.3, POLE_HEIGHT, 0.3),
    metal,
    spots.length,
  );
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, ARM), metal, spots.length);
  const lamp = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.6, 0.3, 0.9),
    new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  spots.forEach(({ at, facing }, i) => {
    // Built along +Z: turned so +Z points to the track.
    q.setFromAxisAngle(up, Math.atan2(facing.x, facing.z));
    const out = (reach: number, y: number): THREE.Vector3 =>
      new THREE.Vector3(at.x + facing.x * reach, y, at.z + facing.z * reach);
    pole.setMatrixAt(i, m.compose(out(0, POLE_HEIGHT / 2), q, one));
    arm.setMatrixAt(i, m.compose(out(ARM / 2, POLE_HEIGHT - 0.1), q, one));
    lamp.setMatrixAt(i, m.compose(out(ARM - 0.3, POLE_HEIGHT - 0.35), q, one));
  });
  const group = new THREE.Group();
  group.add(pole, arm, lamp);
  return group;
}

/**
 * Stars on a dome of `radius` round `centre`, between 8° and 80° up: pixels of fixed size that
 * ignore the fog. Seeded, so the sky is the same on every load.
 */
export function createStars(
  centre: Vec2,
  radius: number,
  count: number,
  seed: number,
): THREE.Points {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const yaw = random() * Math.PI * 2;
    const pitch = THREE.MathUtils.degToRad(8 + random() * 72);
    positions[i * 3] = centre.x + Math.cos(pitch) * Math.cos(yaw) * radius;
    positions[i * 3 + 1] = Math.sin(pitch) * radius;
    positions[i * 3 + 2] = centre.z + Math.cos(pitch) * Math.sin(yaw) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: '#dfe6ff', size: 2, sizeAttenuation: false, fog: false }),
  );
}
