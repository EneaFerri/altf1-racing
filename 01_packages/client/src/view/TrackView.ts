import * as THREE from 'three';
import { TRACK_RULES, type KerbKind, type Track, type TrackSide } from '@altf1/shared';
import {
  createAsphaltTexture,
  createCheckerTexture,
  createGravelTexture,
  createKerbTexture,
  createTyreWallTexture,
} from './pixelTexture';

// Heights above the grass, stacked to avoid z-fighting between overlapping layers.
const Y_GRAVEL = 0.01;
const Y_ASPHALT = 0.02;
const Y_KERB = 0.03;
const Y_START_LINE = 0.035;
const Y_HIGH_KERB = 0.12;
const WALL_HEIGHT = 1;

/** Metres covered by one texture repeat along the track. */
const KERB_REPEAT = 2; // 1 m per colour block
const GRAVEL_REPEAT = 6;
const WALL_REPEAT = 2;

const SIDES: readonly TrackSide[] = ['left', 'right'];
const sign = (side: TrackSide): number => (side === 'right' ? 1 : -1);

/**
 * Builds the circuit's meshes from the same compiled `Track` the simulation uses,
 * so what you see is exactly what the physics feels.
 */
export function createTrackView(track: Track): THREE.Group {
  const group = new THREE.Group();
  const { halfWidth, runoffWidth } = track;
  const kerbFrom = halfWidth - TRACK_RULES.kerbInset;
  const kerbTo = halfWidth + TRACK_RULES.kerbOutset;

  // One asphalt repeat per track width, so the (square) texture keeps square pixels.
  group.add(
    ribbon(track, -halfWidth, halfWidth, Y_ASPHALT, createAsphaltTexture(), halfWidth * 2),
  );

  for (const side of SIDES) {
    const s = sign(side);
    const info = track.sides[side];
    const kerbIs = (kind: KerbKind) => (i: number) => info.kerb[i] === kind;

    group.add(
      ribbon(
        track,
        s * halfWidth,
        s * (halfWidth + runoffWidth - 0.3),
        Y_GRAVEL,
        createGravelTexture(),
        GRAVEL_REPEAT,
        (i) => info.runoff[i] === 'gravel',
      ),
      ribbon(
        track,
        s * kerbFrom,
        s * kerbTo,
        Y_KERB,
        createKerbTexture('#e10600', '#f4f4f4'),
        KERB_REPEAT,
        kerbIs('low'),
      ),
      ribbon(
        track,
        s * kerbFrom,
        s * kerbTo,
        Y_HIGH_KERB,
        createKerbTexture('#f5c400', '#151515'),
        KERB_REPEAT,
        kerbIs('high'),
      ),
    );
  }

  group.add(createWalls(track), createStartLine(track));
  return group;
}

/**
 * Flat strip between two signed lateral offsets (positive = right of the driving direction).
 * U runs across the strip, V along the track. `include(i)` selects which segments are built.
 */
function ribbon(
  track: Track,
  offsetA: number,
  offsetB: number,
  y: number,
  texture: THREE.Texture,
  metresPerRepeat: number,
  include: (segment: number) => boolean = () => true,
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
    const corner = (s: typeof a, offset: number): [number, number, number] => [
      s.position.x + s.normal.x * offset,
      y,
      s.position.z + s.normal.z * offset,
    ];
    const a0 = corner(a, offsetA);
    const a1 = corner(a, offsetB);
    const b0 = corner(b, offsetA);
    const b1 = corner(b, offsetB);
    positions.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
    uvs.push(0, vA, 0, vB, 1, vA, 1, vA, 0, vB, 1, vB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }),
  );
}

/** Vertical tyre walls along the track's wall segments. */
function createWalls(track: Track): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  let along = 0;

  for (const wall of track.walls) {
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
    const u0 = along / WALL_REPEAT;
    const u1 = (along + length) / WALL_REPEAT;
    along += length;
    positions.push(
      wall.a.x,
      0,
      wall.a.z,
      wall.b.x,
      0,
      wall.b.z,
      wall.a.x,
      WALL_HEIGHT,
      wall.a.z,
      wall.a.x,
      WALL_HEIGHT,
      wall.a.z,
      wall.b.x,
      0,
      wall.b.z,
      wall.b.x,
      WALL_HEIGHT,
      wall.b.z,
    );
    uvs.push(u0, 0, u1, 0, u0, 1, u0, 1, u1, 0, u1, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ map: createTyreWallTexture(), side: THREE.DoubleSide }),
  );
}

/** Chequered strip across the track at sample 0. */
function createStartLine(track: Track): THREE.Mesh {
  const start = track.samples[0]!;
  const texture = createCheckerTexture(16, '#ffffff', '#111111');
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(track.halfWidth / 2, 0.5);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(track.halfWidth * 2, 2),
    new THREE.MeshLambertMaterial({ map: texture }),
  );
  line.rotation.x = -Math.PI / 2;
  // After lying flat the plane's width runs along X; turn it so it spans the track.
  line.rotation.z = Math.atan2(-start.normal.z, start.normal.x);
  line.position.set(start.position.x, Y_START_LINE, start.position.z);
  return line;
}
