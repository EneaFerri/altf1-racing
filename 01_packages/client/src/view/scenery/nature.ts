import * as THREE from 'three';
import type { Vec2 } from '@altf1/shared';
import { createBalloonTexture, createWaterTexture } from '../pixelTexture';
import { polylineRibbon } from '../ribbon';
import type { Circle } from './placement';
import { seededRandom } from './placement';

// Low-poly nature for themed tracks: mountains, trees, pines, water, balloons. Flat-shaded, Krunker-style.

const Y_BANK = 0.004;
const Y_WATER = 0.008;
/** Metres per water texture repeat. */
const WATER_TILE = 6;
/** Dirt bank showing on each side of the water (m). */
const BANK_WIDTH = 3;

/**
 * A ring of big grey peaks around `center`, from `radius` outwards. Drawn without fog so they frame
 * the sky like Krunker's backdrop.
 */
export function createMountains(center: Vec2, radius: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const random = seededRandom(seed);
  const greys = ['#8d8d93', '#9a9aa0', '#828288', '#a5a5ab'].map(
    (color) => new THREE.MeshLambertMaterial({ color, flatShading: true, fog: false }),
  );
  const count = 34;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.15;
    const distance = radius + random() * radius * 0.5;
    const height = 160 + random() * 260;
    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(height * (0.9 + random() * 0.6), height, 5 + Math.floor(random() * 3)),
      greys[i % greys.length]!,
    );
    peak.position.set(
      center.x + Math.cos(angle) * distance,
      height / 2 - 10,
      center.z + Math.sin(angle) * distance,
    );
    peak.rotation.y = random() * Math.PI;
    group.add(peak);
  }
  return group;
}

/** Low-poly trees (trunk + two flat dark-green canopies), one instanced mesh per part. */
export function createTrees(spots: readonly Vec2[], seed: number): THREE.Group {
  const random = seededRandom(seed);
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.35, 0.5, 5, 5),
    new THREE.MeshLambertMaterial({ color: '#3f2d1f', flatShading: true }),
    spots.length,
  );
  const crown = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: '#3d6338', flatShading: true }),
    spots.length,
  );
  const top = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: '#4a7543', flatShading: true }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((spot, i) => {
    const size = 0.8 + random() * 0.7;
    q.setFromAxisAngle(up, random() * Math.PI * 2);
    m.compose(
      new THREE.Vector3(spot.x, 2.5 * size, spot.z),
      q,
      new THREE.Vector3(size, size, size),
    );
    trunk.setMatrixAt(i, m);
    m.compose(
      new THREE.Vector3(spot.x, 5.2 * size, spot.z),
      q,
      new THREE.Vector3(4.2 * size, 1.6 * size, 4.2 * size),
    );
    crown.setMatrixAt(i, m);
    m.compose(
      new THREE.Vector3(spot.x + 0.8 * size, 6.6 * size, spot.z - 0.5 * size),
      q,
      new THREE.Vector3(2.6 * size, 1.2 * size, 2.6 * size),
    );
    top.setMatrixAt(i, m);
  });
  const group = new THREE.Group();
  group.add(trunk, crown, top);
  return group;
}

/**
 * Mediterranean umbrella pines (instanced): a tall bare trunk, leaning a little, under a wide flat
 * dark crown. Seeded, so the same spots always grow the same trees.
 */
export function createPines(spots: readonly Vec2[], seed: number): THREE.Group {
  const random = seededRandom(seed);
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.45, 8, 5),
    new THREE.MeshLambertMaterial({ color: '#5a4030', flatShading: true }),
    spots.length,
  );
  const crown = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: '#2f5230', flatShading: true }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);
  spots.forEach((spot, i) => {
    const size = 0.8 + random() * 0.5;
    q.setFromAxisAngle(up, random() * Math.PI * 2);
    lean.setFromAxisAngle(side, (random() - 0.5) * 0.25);
    m.compose(
      new THREE.Vector3(spot.x, 4 * size, spot.z),
      q.clone().multiply(lean),
      new THREE.Vector3(size, size, size),
    );
    trunk.setMatrixAt(i, m);
    m.compose(
      new THREE.Vector3(spot.x, 8.6 * size, spot.z),
      q,
      new THREE.Vector3(5 * size, 1.3 * size, 5 * size),
    );
    crown.setMatrixAt(i, m);
  });
  const group = new THREE.Group();
  group.add(trunk, crown);
  return group;
}

/** A river along `path` ending in a round pond, with dirt banks. Flat, just above the grass. */
export function createRiver(path: readonly Vec2[], width: number, pond: Circle): THREE.Group {
  const water = new THREE.MeshLambertMaterial({ map: createWaterTexture() });
  const bank = new THREE.MeshLambertMaterial({ color: '#5e4a33' });
  const group = new THREE.Group();
  group.add(
    polylineRibbon(path, width + BANK_WIDTH * 2, Y_BANK, bank, WATER_TILE),
    polylineRibbon(path, width, Y_WATER, water, WATER_TILE),
  );
  // CircleGeometry's UVs span 0..1 across the disc: repeat so the pond's pixels match the river's.
  const pondTexture = createWaterTexture();
  pondTexture.repeat.set((pond.r * 2) / WATER_TILE, (pond.r * 2) / WATER_TILE);
  const pondWater = new THREE.MeshLambertMaterial({ map: pondTexture });
  for (const [radius, y, material] of [
    [pond.r + BANK_WIDTH, Y_BANK, bank],
    [pond.r, Y_WATER, pondWater],
  ] as const) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(pond.x, y, pond.z);
    group.add(disc);
  }
  return group;
}

/** Striped hot-air balloons floating high above the circuit. */
export function createBalloons(spots: readonly Vec2[], seed: number): THREE.Group {
  const random = seededRandom(seed);
  const colours = ['#b9a2e6', '#9fb4e8', '#e8a2c8'];
  const basket = new THREE.MeshLambertMaterial({ color: '#6b4a2f', flatShading: true });
  const group = new THREE.Group();
  spots.forEach((spot, i) => {
    const balloon = new THREE.Group();
    const envelope = new THREE.Mesh(
      new THREE.SphereGeometry(9, 8, 6),
      new THREE.MeshLambertMaterial({
        map: createBalloonTexture(colours[i % colours.length]!),
        flatShading: true,
      }),
    );
    envelope.scale.set(1, 1.2, 1);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), basket);
    box.position.y = -14;
    balloon.add(envelope, box);
    balloon.position.set(spot.x, 70 + random() * 70, spot.z);
    group.add(balloon);
  });
  return group;
}
