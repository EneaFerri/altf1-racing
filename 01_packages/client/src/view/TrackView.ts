import * as THREE from 'three';
import {
  locateOnTrack,
  TRACK_RULES,
  vec2,
  type KerbKind,
  type Track,
  type TrackSample,
  type TrackSide,
} from '@altf1/shared';
import {
  createArmcoTexture,
  createChainFenceTexture,
  createCheckerTexture,
  createConcreteTexture,
  createGravelTexture,
  createKerbTexture,
  createSectorBoardTexture,
  createTyreWallTexture,
  createWoodFenceTexture,
} from './pixelTexture';
import { ribbon, type Band } from './ribbon';
import type { TrackTheme, WallStyle } from './themes/theme';

// Heights above the grass, stacked to avoid z-fighting between overlapping layers.
const Y_GRAVEL = 0.01;
const Y_ASPHALT = 0.02;
const Y_EDGE_LINE = 0.025;
const Y_KERB = 0.03;
const Y_START_LINE = 0.035;
const Y_SECTOR_LINE = 0.035;
const Y_HIGH_KERB = 0.12;
const WALL_HEIGHT = 1;
/** Wooden fence: two rails on posts, see-through between them. */
const FENCE_HEIGHT = 1.4;
const FENCE_REPEAT = 3;
/** Concrete wall with a chain-link fence on top (grandstand stretches). */
const CONCRETE_HEIGHT = 1.1;
const CHAIN_HEIGHT = 2.2;
const CONCRETE_REPEAT = 3;
const CHAIN_REPEAT = 2;
/** Guard rail (armco): a steel beam on posts, see-through below and above it. */
const ARMCO_HEIGHT = 1.2;
const ARMCO_REPEAT = 2.5;
/** Street circuit (Monaco): a tall catch fence on top of the guard rail. */
const CATCH_FENCE_HEIGHT = 3.3;

/** Metres covered by one texture repeat along the track. */
const ASPHALT_TILE = 12; // also across: the asphalt is textured in world metres, so pixels stay square
const GRAVEL_REPEAT = 6;
const WALL_REPEAT = 2;
/** Painted white line just inside each asphalt edge (m). */
const EDGE_LINE_WIDTH = 0.4;

/** Sector gantry: posts just behind the walls, a board across the whole track. */
const GANTRY_HEIGHT = 6;
const BOARD_HEIGHT = 1.6;
/** Length of one board tile (m): the 16×8 texture keeps square pixels. */
const BOARD_TILE = BOARD_HEIGHT * 2;
const POST_SIZE = 0.4;
/** Painted line across the asphalt at sector starts (m, along the track). */
const SECTOR_LINE_DEPTH = 0.6;

const SIDES: readonly TrackSide[] = ['left', 'right'];
const sign = (side: TrackSide): number => (side === 'right' ? 1 : -1);

const textured = (texture: THREE.Texture): THREE.Material =>
  new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });

/**
 * Builds the circuit's meshes from the same compiled `Track` the simulation uses,
 * so what you see is exactly what the physics feels. Width varies per sample.
 * Colours, textures and wall styles come from the track's `theme`. With branches, each road is
 * drawn too, and kerbs, lines and gravel only where the physics puts them on that road (not across
 * the mouth of another road at a fork).
 */
export function createTrackView(track: Track, theme: TrackTheme): THREE.Group {
  const group = new THREE.Group();
  const materials: RoadMaterials = {
    asphalt: textured(theme.asphalt()),
    line: new THREE.MeshLambertMaterial({ color: '#e8e8e8', side: THREE.DoubleSide }),
    lowKerb: textured(createKerbTexture(...theme.kerb.colors)),
    highKerb: textured(createKerbTexture('#f5c400', '#151515')),
    gravel: textured(createGravelTexture()),
  };
  group.add(...createRoad(track, track, -1, () => true, theme, materials));
  track.routes.forEach((road, route) => {
    const { from, to } = road.branch!;
    const onBranch = (i: number): boolean => {
      const d = road.samples[i]!.distance;
      return d >= from && d <= to;
    };
    group.add(...createRoad(track, road, route, onBranch, theme, materials));
  });
  group.add(
    ...createWalls(track, theme.wallStyle(track)),
    createStartLine(track),
    ...createSectorGantries(track),
  );
  return group;
}

interface RoadMaterials {
  readonly asphalt: THREE.Material;
  readonly line: THREE.Material;
  readonly lowKerb: THREE.Material;
  readonly highKerb: THREE.Material;
  readonly gravel: THREE.Material;
}

/**
 * Asphalt, edge lines, kerbs and gravel of one road (`route`: -1 = main loop) over the segments
 * `include` picks. A branch's asphalt sits a hair lower, so the main road wins where they overlap.
 */
function createRoad(
  track: Track,
  road: Track,
  route: number,
  include: (segment: number) => boolean,
  theme: TrackTheme,
  materials: RoadMaterials,
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [
    ribbon(
      road,
      (s) => [-s.halfWidth, s.halfWidth],
      route < 0 ? Y_ASPHALT : Y_ASPHALT - 0.002,
      materials.asphalt,
      ASPHALT_TILE,
      { include, metresAcross: ASPHALT_TILE },
    ),
  ];
  const kerbRepeat = theme.kerb.block * 2; // one texture repeat = two blocks
  // True when the point `offset` m across sample i belongs to this road for the physics.
  const owns = (i: number, offset: number): boolean => {
    const s = road.samples[i]!;
    const p = vec2(s.position.x + s.normal.x * offset, s.position.z + s.normal.z * offset);
    return locateOnTrack(track, p).route === route;
  };

  for (const side of SIDES) {
    const k = sign(side);
    const info = road.sides[side];
    const kerbMid = (i: number): number =>
      k * (road.samples[i]!.halfWidth + (road.kerbOutset - road.kerbInset) / 2);
    const kerbIs = (kind: KerbKind) => (i: number) =>
      include(i) && info.kerb[i] === kind && owns(i, kerbMid(i));
    const kerbBand: Band = (s) => [
      k * (s.halfWidth - road.kerbInset),
      k * (s.halfWidth + road.kerbOutset),
    ];
    const lineAt = (s: TrackSample): number => s.halfWidth - theme.edgeLineInset;

    meshes.push(
      ribbon(
        road,
        (s) => [k * (lineAt(s) - EDGE_LINE_WIDTH), k * lineAt(s)],
        Y_EDGE_LINE,
        materials.line,
        1,
        { include: (i) => include(i) && owns(i, k * (lineAt(road.samples[i]!) - 0.2)) },
      ),
      ribbon(
        road,
        (s) => [k * s.halfWidth, k * (s.halfWidth + road.runoffWidth - 0.3)],
        Y_GRAVEL,
        materials.gravel,
        GRAVEL_REPEAT,
        {
          include: (i) =>
            include(i) &&
            info.runoff[i] === 'gravel' &&
            owns(i, k * (road.samples[i]!.halfWidth + road.runoffWidth / 2)),
        },
      ),
      ribbon(road, kerbBand, Y_KERB, materials.lowKerb, kerbRepeat, { include: kerbIs('low') }),
      ribbon(road, kerbBand, Y_HIGH_KERB, materials.highKerb, 2, { include: kerbIs('high') }),
    );
  }
  return meshes;
}

/** Vertical strips along the track's wall segments, one mesh per style (and layer) in use. */
function createWalls(track: Track, styleOf: (index: number) => WallStyle): THREE.Mesh[] {
  const indices = (style: WallStyle): number[] =>
    track.walls.map((_, i) => i).filter((i) => styleOf(i) === style);
  const cutout = (texture: THREE.Texture): THREE.Material =>
    new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide, alphaTest: 0.5 });
  const meshes: THREE.Mesh[] = [];
  const tyres = indices('tyres');
  if (tyres.length > 0) {
    meshes.push(
      wallStrip(track, tyres, 0, WALL_HEIGHT, textured(createTyreWallTexture()), WALL_REPEAT),
    );
  }
  const fence = indices('fence');
  if (fence.length > 0) {
    meshes.push(
      wallStrip(track, fence, 0, FENCE_HEIGHT, cutout(createWoodFenceTexture()), FENCE_REPEAT),
    );
  }
  const armco = indices('armco');
  if (armco.length > 0) {
    meshes.push(
      wallStrip(track, armco, 0, ARMCO_HEIGHT, cutout(createArmcoTexture()), ARMCO_REPEAT),
    );
  }
  const armcoFence = indices('armcoFence');
  if (armcoFence.length > 0) {
    meshes.push(
      wallStrip(track, armcoFence, 0, ARMCO_HEIGHT, cutout(createArmcoTexture()), ARMCO_REPEAT),
      wallStrip(
        track,
        armcoFence,
        ARMCO_HEIGHT,
        ARMCO_HEIGHT + CATCH_FENCE_HEIGHT,
        cutout(createChainFenceTexture()),
        CHAIN_REPEAT,
        CHAIN_REPEAT,
      ),
    );
  }
  const concrete = indices('concrete');
  if (concrete.length > 0) {
    meshes.push(
      wallStrip(
        track,
        concrete,
        0,
        CONCRETE_HEIGHT,
        textured(createConcreteTexture()),
        CONCRETE_REPEAT,
      ),
      wallStrip(
        track,
        concrete,
        CONCRETE_HEIGHT,
        CONCRETE_HEIGHT + CHAIN_HEIGHT,
        cutout(createChainFenceTexture()),
        CHAIN_REPEAT,
        CHAIN_REPEAT,
      ),
    );
  }
  return meshes;
}

/**
 * Vertical strip from `bottom` to `top` along the wall segments `indices`: one texture tile every
 * `repeat` m along the wall and every `tileHeight` m up it.
 */
function wallStrip(
  track: Track,
  indices: readonly number[],
  bottom: number,
  top: number,
  material: THREE.Material,
  repeat: number,
  tileHeight: number = top - bottom,
): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const vTop = (top - bottom) / tileHeight;
  let along = 0;
  for (const i of indices) {
    const wall = track.walls[i]!;
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
    const u0 = along / repeat;
    const u1 = (along + length) / repeat;
    along += length;
    positions.push(
      wall.a.x,
      bottom,
      wall.a.z,
      wall.b.x,
      bottom,
      wall.b.z,
      wall.a.x,
      top,
      wall.a.z,
      wall.a.x,
      top,
      wall.a.z,
      wall.b.x,
      bottom,
      wall.b.z,
      wall.b.x,
      top,
      wall.b.z,
    );
    uvs.push(u0, 0, u1, 0, u0, vTop, u0, vTop, u1, 0, u1, vTop);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
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

/**
 * A gantry where each sector starts (S1 on the start line), readable from far away: two posts
 * just behind the walls and a board across the track labelled with the sector, plus a yellow
 * line on the asphalt (the start line already has its chequered one).
 */
function createSectorGantries(track: Track): THREE.Object3D[] {
  const post = new THREE.MeshLambertMaterial({ color: '#2a2a33' });
  const line = new THREE.MeshLambertMaterial({ color: '#f5c518' });
  return Array.from({ length: TRACK_RULES.sectorCount }, (_, sector) => {
    const start = track.sectorStarts[sector]!;
    const sample = nearestSample(track, start);
    const across = Math.atan2(-sample.normal.z, sample.normal.x);
    const reach = sample.halfWidth + track.runoffWidth + POST_SIZE;

    const gantry = new THREE.Group();
    gantry.position.set(sample.position.x, 0, sample.position.z);
    gantry.rotation.y = across; // local X now runs across the track

    const texture = createSectorBoardTexture(`S${sector + 1}`);
    texture.repeat.set((reach * 2) / BOARD_TILE, 1);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(reach * 2, BOARD_HEIGHT, 0.3),
      new THREE.MeshLambertMaterial({ map: texture }),
    );
    board.position.y = GANTRY_HEIGHT;
    gantry.add(board);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(POST_SIZE, GANTRY_HEIGHT, POST_SIZE),
        post,
      );
      pillar.position.set(side * reach, GANTRY_HEIGHT / 2, 0);
      gantry.add(pillar);
    }
    if (sector > 0) {
      const paint = new THREE.Mesh(
        new THREE.PlaneGeometry(sample.halfWidth * 2, SECTOR_LINE_DEPTH),
        line,
      );
      paint.rotation.x = -Math.PI / 2;
      paint.position.y = Y_SECTOR_LINE;
      gantry.add(paint);
    }
    return gantry;
  });
}

/** Centreline sample closest to `distance` along the track. */
function nearestSample(track: Track, distance: number): TrackSample {
  let best = track.samples[0]!;
  for (const sample of track.samples) {
    if (Math.abs(sample.distance - distance) < Math.abs(best.distance - distance)) best = sample;
  }
  return best;
}
