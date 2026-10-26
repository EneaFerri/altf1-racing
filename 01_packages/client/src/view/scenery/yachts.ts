import * as THREE from 'three';
import type { Mooring } from './placement';
import { seededRandom } from './placement';

// Monaco's yachts, moored stern-to along Port Hercule's pontoons (placement: `mooredBoats`).
// One instanced mesh per part, built in a boat's local frame: +Z to the bow, X across, Y up.

/** The sea's surface (m, as in town.ts). */
const WATERLINE = 0.15;
/** Hull height per metre of length; beam per length (as in placement.ts). */
const FREEBOARD = 0.09;
const BEAM = 0.22;
/** Boats longer than this get a second deck (m). */
const TWO_DECKS = 26;
const NAVY_SHARE = 0.25;

/** A hull 1 m long, 1 m wide and 1 m high: square stern at z = −0.5, a pointed bow at +0.5. */
function hullGeometry(): THREE.BufferGeometry {
  const [s, m, b] = [-0.5, 0.15, 0.5]; // stern, where the bow starts narrowing, bow tip
  const outline: [number, number][] = [
    [-0.5, s],
    [0.5, s],
    [0.5, m],
    [0, b],
    [-0.5, m],
  ];
  const positions: number[] = [];
  const at = (i: number, y: number): number[] => [outline[i]![0], y, outline[i]![1]];
  // Sides.
  outline.forEach((_, i) => {
    const j = (i + 1) % outline.length;
    positions.push(...at(i, 0), ...at(j, 0), ...at(i, 1), ...at(i, 1), ...at(j, 0), ...at(j, 1));
  });
  // Deck (a fan from the stern's middle).
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    positions.push(0, 1, s, ...at(i, 1), ...at(j, 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const material = (color: string): THREE.Material =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });

/** Every moored boat: a white or navy hull, a white superstructure with dark windows, maybe two decks. */
export function createYachts(boats: readonly Mooring[], seed: number): THREE.Group {
  const random = seededRandom(seed);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const hull = hullGeometry();
  const white = boats.map(() => random() > NAVY_SHARE);
  const big = boats.map((b) => b.length > TWO_DECKS);
  const parts = {
    whiteHull: new THREE.InstancedMesh(hull, material('#f2f2ef'), white.filter(Boolean).length),
    navyHull: new THREE.InstancedMesh(hull, material('#1f2c44'), white.filter((w) => !w).length),
    deck: new THREE.InstancedMesh(box, material('#f7f7f4'), boats.length),
    windows: new THREE.InstancedMesh(box, material('#1c2530'), boats.length),
    upper: new THREE.InstancedMesh(box, material('#f7f7f4'), big.filter(Boolean).length),
  };
  const count = { whiteHull: 0, navyHull: 0, deck: 0, windows: 0, upper: 0 };
  const boat = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (
    part: keyof typeof parts,
    [x, y, z]: readonly number[],
    [w, h, d]: readonly number[],
  ): void => {
    local.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    parts[part].setMatrixAt(count[part]++, boat.clone().multiply(local));
  };
  boats.forEach((b, i) => {
    q.setFromAxisAngle(up, Math.atan2(b.bow.x, b.bow.z));
    boat.compose(new THREE.Vector3(b.at.x, WATERLINE, b.at.z), q, new THREE.Vector3(1, 1, 1));
    const L = b.length;
    const beam = L * BEAM;
    const freeboard = L * FREEBOARD;
    place(white[i] ? 'whiteHull' : 'navyHull', [0, 0, 0], [beam, freeboard, L]);
    place('deck', [0, freeboard + 0.9, -0.1 * L], [beam * 0.72, 1.8, L * 0.5]);
    place('windows', [0, freeboard + 1.1, -0.1 * L], [beam * 0.74, 0.6, L * 0.46]);
    if (big[i]) place('upper', [0, freeboard + 2.5, -0.14 * L], [beam * 0.56, 1.5, L * 0.3]);
  });
  const group = new THREE.Group();
  group.add(...Object.values(parts));
  return group;
}
