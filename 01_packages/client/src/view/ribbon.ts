import * as THREE from 'three';
import type { Track, TrackSample, Vec2 } from '@altf1/shared';

/** Lateral band of a strip at one sample: [from, to] signed offsets (positive = right). */
export type Band = (sample: TrackSample) => readonly [number, number];

/**
 * Flat strip along the track within `band`. V runs along the track (`metresPerRepeat` per repeat);
 * U spans the strip 0..1, or world metres / `metresAcross` when given. `include(i)` picks segments.
 */
export function ribbon(
  track: Track,
  band: Band,
  y: number,
  material: THREE.Material,
  metresPerRepeat: number,
  {
    include = () => true,
    metresAcross,
  }: { include?: (segment: number) => boolean; metresAcross?: number } = {},
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const n = track.samples.length;

  for (let i = 0; i < n; i++) {
    if (!include(i)) continue;
    const a = track.samples[i]!;
    const b = track.samples[(i + 1) % n]!;
    const vA = a.distance / metresPerRepeat;
    const vB = (i + 1 === n ? track.length : b.distance) / metresPerRepeat;
    const corner = (s: TrackSample, offset: number): [number, number, number] => [
      s.position.x + s.normal.x * offset,
      y,
      s.position.z + s.normal.z * offset,
    ];
    const [a0, a1] = band(a);
    const [b0, b1] = band(b);
    const u = (offset: number, edge: 0 | 1): number =>
      metresAcross ? offset / metresAcross : edge;
    positions.push(
      ...corner(a, a0),
      ...corner(b, b0),
      ...corner(a, a1),
      ...corner(a, a1),
      ...corner(b, b0),
      ...corner(b, b1),
    );
    uvs.push(u(a0, 0), vA, u(b0, 0), vB, u(a1, 1), vA, u(a1, 1), vA, u(b0, 0), vB, u(b1, 1), vB);
  }
  return flatMesh(positions, uvs, material);
}

/**
 * Flat strip `width` wide following an open polyline (e.g. a river), textured in world metres
 * (`metresPerRepeat` both ways, so pixels stay square).
 */
export function polylineRibbon(
  points: readonly Vec2[],
  width: number,
  y: number,
  material: THREE.Material,
  metresPerRepeat: number,
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const half = width / 2;
  // Normal at each point: perpendicular to the average direction of its two segments.
  const edges = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    return [
      [p.x - nx * half, p.z - nz * half],
      [p.x + nx * half, p.z + nz * half],
    ] as const;
  });
  let along = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [a0, a1] = edges[i]!;
    const [b0, b1] = edges[i + 1]!;
    const v0 = along / metresPerRepeat;
    along += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.z - points[i]!.z);
    const v1 = along / metresPerRepeat;
    const u = width / metresPerRepeat;
    positions.push(
      a0[0],
      y,
      a0[1],
      b0[0],
      y,
      b0[1],
      a1[0],
      y,
      a1[1],
      a1[0],
      y,
      a1[1],
      b0[0],
      y,
      b0[1],
      b1[0],
      y,
      b1[1],
    );
    uvs.push(0, v0, 0, v1, u, v0, u, v0, 0, v1, u, v1);
  }
  return flatMesh(positions, uvs, material);
}

function flatMesh(positions: number[], uvs: number[], material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
