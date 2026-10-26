import * as THREE from 'three';
import type { Vec2 } from '@altf1/shared';
import {
  createFacadeTexture,
  createGlassFacadeTexture,
  createPavingTexture,
  createPlankTexture,
  createPoolTexture,
  createSeaTexture,
} from '../pixelTexture';
import { polylineRibbon } from '../ribbon';
import { seededRandom } from './placement';

// A town around the circuit (Monaco): buildings from their real footprints and heights, the sea,
// piers, pools and palms. Data from OpenStreetMap (see 01_docs/themes.md).

/** One window bay and one floor of a facade texture (m). */
const BAY = 3.2;
const FLOOR = 3.2;
/** Buildings taller than this get the modern glass facade (m). */
const TOWER = 45;
/** Riviera facades: wall and shutter colours. */
const FACADES: readonly (readonly [string, string])[] = [
  ['#efe2c4', '#5e7d4f'], // cream, green shutters
  ['#e2ad6a', '#7a4b2c'], // ochre, brown
  ['#eaa98f', '#5e7d4f'], // salmon pink, green
  ['#f0d98e', '#8a8f93'], // pale yellow, grey
  ['#f3f0e8', '#4d6f8a'], // white, blue-grey
  ['#d98f6a', '#efe2c4'], // terracotta, cream
];
const ROOF_LOW = '#b4593b'; // terracotta tiles
const ROOF_HIGH = '#cdc8bd'; // flat concrete roofs
// Well above the ground: big flat triangles lose depth precision far away (the sea never reaches
// the track, see scenery.ts).
const Y_SEA = 0.15;
const Y_LAND = 0.16;
const Y_POOL = 0.05;
const SEA_TILE = 8;
const PAVING_TILE = 6;
const POOL_TILE = 2.5;
/** Pier decks above the water (m), walkway width (m). */
const PIER_DECK = 0.5;
const PIER_WIDTH = 3;
const PLANK_TILE = 3;

/** A town building: footprint (ground points), height and base (> 0: it stands on something). */
export interface TownBuilding {
  readonly points: readonly Vec2[];
  readonly height: number;
  readonly base: number;
}

/**
 * Every building as walls and a flat roof, merged into one mesh per material (few draw calls):
 * pastel facades picked per building (seeded), glass for towers, terracotta or concrete roofs.
 */
export function createCity(buildings: readonly TownBuilding[], seed: number): THREE.Group {
  const random = seededRandom(seed);
  const walls = [
    ...FACADES.map(([wall, shutter]) => new Builder(lit(createFacadeTexture(wall, shutter)))),
    new Builder(lit(createGlassFacadeTexture())),
  ];
  const roofs = [new Builder(flat(ROOF_LOW)), new Builder(flat(ROOF_HIGH))];
  for (const b of buildings) {
    const facade = b.height > TOWER ? walls.length - 1 : Math.floor(random() * FACADES.length);
    const top = b.base + b.height;
    walls[facade]!.walls(b.points, b.base, top);
    roofs[b.height > 20 ? 1 : 0]!.polygon(b.points, top, null);
  }
  const group = new THREE.Group();
  for (const builder of [...walls, ...roofs]) {
    const mesh = builder.mesh();
    if (mesh) group.add(mesh);
  }
  return group;
}

/** One building: walls from `bottom` to `top` along its ring, and a flat roof. */
export function extrude(
  ring: readonly Vec2[],
  bottom: number,
  top: number,
  walls: THREE.Material,
  roof: THREE.Material,
): THREE.Group {
  const wall = new Builder(walls);
  wall.walls(ring, bottom, top);
  const cap = new Builder(roof);
  cap.polygon(ring, top, null);
  const group = new THREE.Group();
  for (const builder of [wall, cap]) {
    const mesh = builder.mesh();
    if (mesh) group.add(mesh);
  }
  return group;
}

/** The sea (polygons), with land patches in it drawn as paving. */
export function createSea(
  sea: readonly (readonly Vec2[])[],
  islands: readonly (readonly Vec2[])[],
): THREE.Group {
  // Pulled towards the camera in depth: far away its big triangles would still fight the ground.
  const water = new Builder(
    new THREE.MeshLambertMaterial({
      map: createSeaTexture(),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  for (const ring of sea) water.polygon(ring, Y_SEA, SEA_TILE);
  const land = new Builder(lit(createPavingTexture()));
  for (const ring of islands) land.polygon(ring, Y_LAND, PAVING_TILE);
  const group = new THREE.Group();
  for (const builder of [water, land]) {
    const mesh = builder.mesh();
    if (mesh) group.add(mesh);
  }
  return group;
}

/** Piers and pontoons: plank walkways along lines, decks over areas. */
export function createPiers(
  piers: readonly { readonly points: readonly Vec2[]; readonly area: boolean }[],
): THREE.Group {
  const material = lit(createPlankTexture());
  const decks = new Builder(material);
  const group = new THREE.Group();
  for (const pier of piers) {
    if (pier.area) decks.polygon(pier.points, PIER_DECK, PLANK_TILE);
    else group.add(polylineRibbon(pier.points, PIER_WIDTH, PIER_DECK, material, PLANK_TILE));
  }
  const mesh = decks.mesh();
  if (mesh) group.add(mesh);
  return group;
}

/** Swimming pools: blue water with lane lines. */
export function createPools(pools: readonly (readonly Vec2[])[]): THREE.Group {
  const water = new Builder(lit(createPoolTexture()));
  for (const ring of pools) water.polygon(ring, Y_POOL, POOL_TILE);
  const group = new THREE.Group();
  const mesh = water.mesh();
  if (mesh) group.add(mesh);
  return group;
}

/** Palms (instanced): a slim trunk leaning a little, a crown of drooping fronds. */
export function createPalms(spots: readonly Vec2[], seed: number): THREE.Group {
  const random = seededRandom(seed);
  const FRONDS = 7;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.32, 9, 5),
    new THREE.MeshLambertMaterial({ color: '#8a6a4a', flatShading: true }),
    spots.length,
  );
  // A frond: a long flat blade, pivoted at its base.
  const blade = new THREE.BoxGeometry(0.9, 0.08, 3.6).translate(0, 0, 1.8);
  const fronds = new THREE.InstancedMesh(
    blade,
    new THREE.MeshLambertMaterial({ color: '#4f8a3a', flatShading: true }),
    spots.length * FRONDS,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  spots.forEach((spot, i) => {
    const size = 0.8 + random() * 0.4;
    const lean = new THREE.Vector3((random() - 0.5) * 0.15, 1, (random() - 0.5) * 0.15).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
    m.compose(
      new THREE.Vector3(spot.x + lean.x * 4.5 * size, 4.5 * size, spot.z + lean.z * 4.5 * size),
      q,
      new THREE.Vector3(size, size, size),
    );
    trunk.setMatrixAt(i, m);
    const top = new THREE.Vector3(spot.x + lean.x * 9 * size, 9 * size, spot.z + lean.z * 9 * size);
    const turn = random() * Math.PI * 2;
    for (let k = 0; k < FRONDS; k++) {
      e.set(0.35 + random() * 0.25, turn + (k / FRONDS) * Math.PI * 2, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(top, q, new THREE.Vector3(size, size, size));
      fronds.setMatrixAt(i * FRONDS + k, m);
    }
  });
  const group = new THREE.Group();
  group.add(trunk, fronds);
  return group;
}

function lit(texture: THREE.Texture): THREE.Material {
  return new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
}

function flat(color: string): THREE.Material {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
}

/** Collects triangles for one material: vertical walls along rings, flat polygons. */
class Builder {
  private readonly material: THREE.Material;
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];

  constructor(material: THREE.Material) {
    this.material = material;
  }

  /** Walls along a closed ring from `bottom` to `top`, textured one bay × one floor per repeat. */
  walls(ring: readonly Vec2[], bottom: number, top: number): void {
    const v = (top - bottom) / FLOOR;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      // Whole bays per wall, so windows don't get cut at the corners.
      const u = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / BAY));
      this.positions.push(a.x, bottom, a.z, b.x, bottom, b.z, a.x, top, a.z);
      this.positions.push(a.x, top, a.z, b.x, bottom, b.z, b.x, top, b.z);
      this.uvs.push(0, 0, u, 0, 0, v, 0, v, u, 0, u, v);
    });
  }

  /** A flat polygon at height `y`, textured in world metres (`tile` per repeat; null: plain). */
  polygon(ring: readonly Vec2[], y: number, tile: number | null): void {
    const contour = ring.map((p) => new THREE.Vector2(p.x, p.z));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      for (const i of [a!, b!, c!]) {
        const p = ring[i]!;
        this.positions.push(p.x, y, p.z);
        this.uvs.push(tile ? p.x / tile : 0, tile ? p.z / tile : 0);
      }
    }
  }

  mesh(): THREE.Mesh | null {
    if (this.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, this.material);
  }
}
