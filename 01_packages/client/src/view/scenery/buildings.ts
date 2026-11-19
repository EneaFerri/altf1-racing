import * as THREE from 'three';
import {
  createConcreteTexture,
  createCrowdTexture,
  createGarageTexture,
  createRoofTexture,
} from '../pixelTexture';

// Buildings for themed tracks, each built in a local frame: X along its length, +Z facing the
// track, Y up, origin at its front centre on the ground. Callers place and turn them.

const ROW_DEPTH = 1.4;
const ROW_RISE = 0.9;
const ROWS = 7;

/** Turns an object built facing +Z so it faces `towards` (a unit ground vector). */
export function face(object: THREE.Object3D, towards: { x: number; z: number }): void {
  object.rotation.y = Math.atan2(towards.x, towards.z);
}

/** How far a grandstand reaches from its front: seats and back wall behind, roof in front (m). */
export const GRANDSTAND_REACH = { back: ROWS * ROW_DEPTH + 0.6, roof: 3 } as const;

/** Grandstand `length` m long: stepped rows of seats with a pixel crowd, under a striped roof. */
export function createGrandstand(length: number): THREE.Group {
  const group = new THREE.Group();
  const crowdTexture = createCrowdTexture();
  crowdTexture.repeat.set(length / 4, 1);
  const crowd = new THREE.MeshLambertMaterial({ map: crowdTexture });
  for (let row = 0; row < ROWS; row++) {
    const height = (row + 1) * ROW_RISE;
    const step = new THREE.Mesh(new THREE.BoxGeometry(length, height, ROW_DEPTH), crowd);
    step.position.set(0, height / 2, -(row + 0.5) * ROW_DEPTH);
    group.add(step);
  }
  const depth = ROWS * ROW_DEPTH;
  const concreteTexture = createConcreteTexture();
  concreteTexture.repeat.set(length / 4, 2);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(length, ROWS * ROW_RISE + 5, 0.6),
    new THREE.MeshLambertMaterial({ map: concreteTexture }),
  );
  back.position.set(0, (ROWS * ROW_RISE + 5) / 2, -depth - 0.3);
  const roofTexture = createRoofTexture();
  roofTexture.repeat.set(length / 3, 3);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(length + 2, 0.4, depth + 4),
    new THREE.MeshLambertMaterial({ map: roofTexture }),
  );
  roof.position.set(0, ROWS * ROW_RISE + 5, -depth / 2 + 1);
  roof.rotation.x = 0.12; // slopes down towards the track
  group.add(back, roof);
  return group;
}

/**
 * Pit building `length` × `depth` m, `height` m tall: a row of garages facing +Z (the pit lane),
 * concrete elsewhere, a railing round the roof terrace.
 */
export function createPitBuilding(length: number, depth: number, height: number): THREE.Group {
  const garages = createGarageTexture();
  garages.repeat.set(length / 6, 1);
  const concrete = createConcreteTexture();
  concrete.repeat.set(length / 4, height / 3);
  const wall = new THREE.MeshLambertMaterial({ map: concrete });
  const box = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), [
    wall,
    wall,
    wall,
    wall,
    new THREE.MeshLambertMaterial({ map: garages }),
    wall,
  ]);
  box.position.set(0, height / 2, -depth / 2);
  const railing = new THREE.Mesh(
    new THREE.BoxGeometry(length, 1, 0.2),
    new THREE.MeshLambertMaterial({ color: '#f2f2f2' }),
  );
  railing.position.set(0, height + 0.5, -0.1);
  const group = new THREE.Group();
  group.add(box, railing);
  return group;
}
