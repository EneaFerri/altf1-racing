import * as THREE from 'three';
import {
  createBarnWallTexture,
  createCheckerTexture,
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
const DARK_WOOD = '#4a3826';
const STEEL = '#55555c';

/** Turns an object built facing +Z so it faces `towards` (a unit ground vector). */
export function face(object: THREE.Object3D, towards: { x: number; z: number }): void {
  object.rotation.y = Math.atan2(towards.x, towards.z);
}

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

/** Floodlight tower: a steel pole with a lamp panel facing +Z. */
export function createFloodlight(height = 26): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: STEEL, flatShading: true });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.6), steel);
  pole.position.y = height / 2;
  const lamps = new THREE.Mesh(
    new THREE.BoxGeometry(5, 3.5, 0.6),
    new THREE.MeshLambertMaterial({ map: createCheckerTexture(16, '#ffffff', '#c9c9c9') }),
  );
  lamps.position.set(0, height + 1, 0.4);
  lamps.rotation.x = -0.3;
  group.add(pole, lamps);
  return group;
}

/** Wooden barn: plank walls, a dark gable roof and a big door on the +Z side. */
export function createBarn(): THREE.Group {
  const group = new THREE.Group();
  const width = 22;
  const depth = 15;
  const height = 9;
  const wallTexture = createBarnWallTexture();
  wallTexture.repeat.set(width / 4, height / 4);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ map: wallTexture }),
  );
  body.position.y = height / 2;
  const roof = gableRoof(width + 2, depth + 2, 7, DARK_WOOD);
  roof.position.y = height;
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshLambertMaterial({ color: '#2e2219' }),
  );
  door.position.set(0, 3, depth / 2 + 0.05);
  group.add(body, roof, door);
  return group;
}

/**
 * Covered wooden bridge over the track: posts on both sides, plank walls on the upper half and a
 * gable roof. Built with X across the track (`span` m) and Z along it (`length` m).
 */
export function createCoveredBridge(span: number, length: number): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: DARK_WOOD, flatShading: true });
  const height = 6;
  for (const side of [-1, 1]) {
    for (let z = -length / 2; z <= length / 2 + 0.01; z += length / 4) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, height, 0.7), wood);
      post.position.set((side * span) / 2, height / 2, z);
      group.add(post);
    }
    const wallTexture = createBarnWallTexture();
    wallTexture.repeat.set(length / 4, 1);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, height / 2, length),
      new THREE.MeshLambertMaterial({ map: wallTexture }),
    );
    wall.position.set((side * span) / 2, height * 0.75, 0);
    group.add(wall);
  }
  // gableRoof's ridge runs along X: turned a quarter, it follows the track.
  const roof = gableRoof(length + 2, span + 3, 6, DARK_WOOD);
  roof.position.y = height;
  roof.rotation.y = Math.PI / 2;
  group.add(roof);
  return group;
}

/** Solid gable roof: a triangular prism `width` wide (ridge along X), `depth` deep, `height` tall. */
function gableRoof(width: number, depth: number, height: number, color: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-depth / 2, 0);
  shape.lineTo(depth / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // The shape lies in XY and extrudes along Z: turn it so the ridge runs along X, centred.
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, flatShading: true }));
}
