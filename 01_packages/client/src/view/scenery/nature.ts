import * as THREE from 'three';
import type { Vec2 } from '@altf1/shared';
import { seededRandom } from './placement';

// Low-poly nature for themed tracks: mountains, trees, pines, volcanoes. Flat-shaded, Krunker-style.

/**
 * A ring (or an `arc`) of big low-poly peaks around `center`, from `radius` outwards, grey unless
 * `colors` are given. Drawn without fog so they frame the sky like Krunker's backdrop.
 */
export function createMountains(
  center: Vec2,
  radius: number,
  seed: number,
  {
    colors = ['#8d8d93', '#9a9aa0', '#828288', '#a5a5ab'],
    arc = [0, Math.PI * 2],
  }: {
    readonly colors?: readonly string[];
    /** Only between these angles (rad, from +x towards +z): e.g. not over the sea. */
    readonly arc?: readonly [number, number];
  } = {},
): THREE.Group {
  const group = new THREE.Group();
  const random = seededRandom(seed);
  const greys = colors.map(
    (color) => new THREE.MeshLambertMaterial({ color, flatShading: true, fog: false }),
  );
  const count = 34;
  for (let i = 0; i < count; i++) {
    const angle = arc[0] + (i / count) * (arc[1] - arc[0]) + random() * 0.15;
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

/**
 * Snow-capped volcanoes on the horizon (Mexico City's Popocatépetl and Iztaccíhuatl), each at a
 * `bearing` (rad, from +x towards +z) and `distance` from `center`: a grey-blue cone under a white
 * cap, drawn without fog like the mountains.
 */
export function createVolcanoes(
  center: Vec2,
  peaks: readonly {
    readonly bearing: number;
    readonly distance: number;
    readonly height: number;
    readonly width: number;
  }[],
): THREE.Group {
  const group = new THREE.Group();
  const rock = new THREE.MeshLambertMaterial({ color: '#7b8196', flatShading: true, fog: false });
  const snow = new THREE.MeshLambertMaterial({ color: '#f4f6fa', flatShading: true, fog: false });
  for (const { bearing, distance, height, width } of peaks) {
    const x = center.x + Math.cos(bearing) * distance;
    const z = center.z + Math.sin(bearing) * distance;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(width, height, 9), rock);
    cone.position.set(x, height / 2 - 10, z);
    // The cap: the top third, a little wider so it covers the rock.
    const cap = new THREE.Mesh(new THREE.ConeGeometry((width / 3) * 1.04, height / 3, 9), snow);
    cap.position.set(x, height - height / 6 - 10 + 0.5, z);
    group.add(cone, cap);
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
