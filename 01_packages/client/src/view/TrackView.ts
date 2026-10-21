import * as THREE from 'three';
import {
  TRACK_RULES,
  type KerbKind,
  type Track,
  type TrackSample,
  type TrackSide,
} from '@altf1/shared';
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
const Y_EDGE_LINE = 0.025;
const Y_KERB = 0.03;
const Y_START_LINE = 0.035;
const Y_HIGH_KERB = 0.12;
const WALL_HEIGHT = 1;

/** Metres covered by one texture repeat along the track. */
const ASPHALT_TILE = 12; // also across: the asphalt is textured in world metres, so pixels stay square
const KERB_REPEAT = 2; // 1 m per colour block
const GRAVEL_REPEAT = 6;
const WALL_REPEAT = 2;
/** Painted white line just inside each asphalt edge (m). */
const EDGE_LINE_WIDTH = 0.4;

const SIDES: readonly TrackSide[] = ['left', 'right'];
const sign = (side: TrackSide): number => (side === 'right' ? 1 : -1);

/** Lateral band of a strip at one sample: [from, to] signed offsets (positive = right). */
type Band = (sample: TrackSample) => readonly [number, number];

const textured = (texture: THREE.Texture): THREE.Material =>
  new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });

/**
 * Builds the circuit's meshes from the same compiled `Track` the simulation uses,
 * so what you see is exactly what the physics feels. Width varies per sample.
 */
export function createTrackView(track: Track): THREE.Group {
  const group = new THREE.Group();
  const { runoffWidth } = track;

  group.add(
    ribbon(
      track,
      (s) => [-s.halfWidth, s.halfWidth],
      Y_ASPHALT,
      textured(createAsphaltTexture()),
      ASPHALT_TILE,
      {
        metresAcross: ASPHALT_TILE,
      },
    ),
  );

  const lineMaterial = new THREE.MeshLambertMaterial({ color: '#e8e8e8', side: THREE.DoubleSide });
  const lowKerb = textured(createKerbTexture('#e10600', '#f4f4f4'));
  const highKerb = textured(createKerbTexture('#f5c400', '#151515'));
  const gravel = textured(createGravelTexture());

  for (const side of SIDES) {
    const k = sign(side);
    const info = track.sides[side];
    const kerbIs = (kind: KerbKind) => (i: number) => info.kerb[i] === kind;
    const kerbBand: Band = (s) => [
      k * (s.halfWidth - TRACK_RULES.kerbInset),
      k * (s.halfWidth + TRACK_RULES.kerbOutset),
    ];

    group.add(
      ribbon(
        track,
        (s) => [k * (s.halfWidth - EDGE_LINE_WIDTH), k * s.halfWidth],
        Y_EDGE_LINE,
        lineMaterial,
        1,
      ),
      ribbon(
        track,
        (s) => [k * s.halfWidth, k * (s.halfWidth + runoffWidth - 0.3)],
        Y_GRAVEL,
        gravel,
        GRAVEL_REPEAT,
        {
          include: (i) => info.runoff[i] === 'gravel',
        },
      ),
      ribbon(track, kerbBand, Y_KERB, lowKerb, KERB_REPEAT, { include: kerbIs('low') }),
      ribbon(track, kerbBand, Y_HIGH_KERB, highKerb, KERB_REPEAT, { include: kerbIs('high') }),
    );
  }

  group.add(createWalls(track), createStartLine(track));
  return group;
}

/**
 * Flat strip along the track within `band`. V runs along the track (`metresPerRepeat` per repeat);
 * U spans the strip 0..1, or world metres / `metresAcross` when given. `include(i)` picks segments.
 */
function ribbon(
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
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
  texture.repeat.set(start.halfWidth / 2, 0.5);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(start.halfWidth * 2, 2),
    new THREE.MeshLambertMaterial({ map: texture }),
  );
  line.rotation.x = -Math.PI / 2;
  // After lying flat the plane's width runs along X; turn it so it spans the track.
  line.rotation.z = Math.atan2(-start.normal.z, start.normal.x);
  line.position.set(start.position.x, Y_START_LINE, start.position.z);
  return line;
}
