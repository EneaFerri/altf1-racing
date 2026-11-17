import * as THREE from 'three';
import type { Track, Vec2 } from '@altf1/shared';
import { createBelleEpoqueTexture, createFacadeTexture } from '../pixelTexture';
import { clearance, insidePolygon, seededRandom } from './placement';
import { extrude, type TownBuilding } from './town';

// Landmarks around a real circuit, each on its real OSM footprint (Monaco's Casino and chapel,
// Mexico City's domes, Singapore's Flyer, Marina Bay Sands' SkyPark and the Esplanade's durians,
// Las Vegas's Sphere, Eiffel Tower, Fountains of Bellagio and Stratosphere: see 01_docs/themes.md).

const COPPER = '#6f9a8a';
const TERRACOTTA = '#b4593b';
/** Casino: mansard height (m), its inset (share of the way to the centre), towers (m). */
const MANSARD = 4;
const MANSARD_INSET = 0.15;
const TOWER_SIZE = 6;
const TOWER_RISE = 9;
const SPIRE = 7;
/** Chapel: wall height at most (m), bell tower size and height (m). */
const CHAPEL_HEIGHT = 9;
const BELFRY_SIZE = 3;
const BELFRY_HEIGHT = 16;

/** The Singapore Flyer: wheel radius, hub height, capsules (m, count); lit rim colour. */
const FLYER_RADIUS = 75;
const FLYER_HUB = 90;
const FLYER_CAPSULES = 28;
const FLYER_SPOKES = 16;
const FLYER_LIGHT = '#bfe6ff';
/** Marina Bay Sands' SkyPark: deck width and depth, how far it runs past the end towers (m). */
const SKYPARK_WIDTH = 44;
const SKYPARK_DEPTH = 10;
const SKYPARK_OVERHANG = 35;
/** The Esplanade's durians: steel grey, their height as a share of their half-width. */
const DURIAN = '#8d949b';
const DURIAN_RISE = 0.75;

const flat = (color: string): THREE.Material =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
const lit = (texture: THREE.Texture): THREE.Material =>
  new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });

/** Monte-Carlo's Casino: Belle Époque walls, a copper mansard, two towers facing the track. */
export function createCasino(track: Track, building: TownBuilding): THREE.Group {
  const { points, base } = building;
  const top = base + Math.max(building.height, 18);
  const copper = flat(COPPER);
  const group = extrude(points, base, top, lit(createBelleEpoqueTexture()), copper);
  const c = centroid(points);
  const inset = points.map((p) => ({
    x: p.x + (c.x - p.x) * MANSARD_INSET,
    z: p.z + (c.z - p.z) * MANSARD_INSET,
  }));
  group.add(extrude(inset, top, top + MANSARD, copper, copper));
  for (const corner of nearestToTrack(track, points, 2)) {
    // Each tower a little inside its corner.
    const at = { x: corner.x + (c.x - corner.x) * 0.08, z: corner.z + (c.z - corner.z) * 0.08 };
    group.add(
      tower(at, top + TOWER_RISE, TOWER_SIZE, SPIRE, lit(createBelleEpoqueTexture()), copper),
    );
  }
  return group;
}

/** The Chapelle Sainte-Dévote: ochre walls, a tiled pyramid roof, a small bell tower. */
export function createChapel(track: Track, building: TownBuilding): THREE.Group {
  const { points, base } = building;
  const top = base + Math.min(building.height, CHAPEL_HEIGHT);
  const walls = lit(createFacadeTexture('#e9c88e', '#8a5a3a'));
  const tiles = flat(TERRACOTTA);
  const group = extrude(points, base, top, walls, tiles);
  const c = centroid(points);
  const radius = Math.max(...points.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 0.6, 4), tiles);
  roof.position.set(c.x, top + radius * 0.3, c.z);
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const [corner] = nearestToTrack(track, points, 1);
  if (corner) group.add(tower(corner, base + BELFRY_HEIGHT, BELFRY_SIZE, 3, walls, tiles));
  return group;
}

/** A square tower `size` wide up to `top`, under a pyramid `spire` high. */
function tower(
  at: Vec2,
  top: number,
  size: number,
  spire: number,
  walls: THREE.Material,
  roof: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(size, top, size), walls);
  body.position.set(at.x, top / 2, at.z);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(size * 0.75, spire, 4), roof);
  cap.position.set(at.x, top + spire / 2, at.z);
  cap.rotation.y = Math.PI / 4;
  group.add(body, cap);
  return group;
}

function centroid(points: readonly Vec2[]): Vec2 {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
  };
}

/** The `count` footprint corners closest to the track (the building's front). */
function nearestToTrack(track: Track, points: readonly Vec2[], count: number): Vec2[] {
  return [...points].sort((a, b) => clearance(track, a) - clearance(track, b)).slice(0, count);
}

/** A domed arena (Mexico City's Palacio de los Deportes, the velodrome): low walls, a copper dome. */
export function createDome(building: TownBuilding): THREE.Group {
  const { points, base } = building;
  const top = base + Math.min(building.height, 8);
  const group = extrude(
    points,
    base,
    top,
    lit(createFacadeTexture('#d9d4c8', '#7a7468')),
    flat(COPPER),
  );
  const c = centroid(points);
  // An elliptic dome over the footprint, its two axes those of the footprint's extent.
  const along = points.map((p) => p.x - c.x);
  const across = points.map((p) => p.z - c.z);
  const rx = (Math.max(...along) - Math.min(...along)) / 2;
  const rz = (Math.max(...across) - Math.min(...across)) / 2;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    flat(COPPER),
  );
  dome.scale.set(rx * 0.95, Math.min(rx, rz) * 0.45, rz * 0.95);
  dome.position.set(c.x, top, c.z);
  group.add(dome);
  return group;
}

/**
 * The Singapore Flyer: a 150 m wheel on its hub 90 m up, facing the track (so the whole circle is
 * seen from it), spokes, capsules round the rim and a lit rim that shows through the fog at night,
 * on two A-frame legs. `building`: its base (the wheel's POI when its own building was left out).
 */
export function createFlyer(track: Track, building: TownBuilding): THREE.Group {
  const c = centroid(building.points);
  const near = nearestOnTrack(track, c);
  const group = new THREE.Group();
  // Built in the X–Y plane round the hub, then turned so its face looks at the track.
  const wheel = new THREE.Group();
  const steel = flat('#cfd6dc');
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(FLYER_RADIUS, 1.4, 6, 48),
    new THREE.MeshBasicMaterial({ color: FLYER_LIGHT, fog: false }),
  );
  wheel.add(rim);
  for (let i = 0; i < FLYER_SPOKES; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, FLYER_RADIUS, 0.5), steel);
    const angle = (i / FLYER_SPOKES) * Math.PI * 2;
    spoke.position.set(
      (Math.cos(angle) * FLYER_RADIUS) / 2,
      (Math.sin(angle) * FLYER_RADIUS) / 2,
      0,
    );
    spoke.rotation.z = angle - Math.PI / 2;
    wheel.add(spoke);
  }
  const capsule = flat('#e8eef2');
  for (let i = 0; i < FLYER_CAPSULES; i++) {
    const angle = (i / FLYER_CAPSULES) * Math.PI * 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 6), capsule);
    box.position.set(Math.cos(angle) * (FLYER_RADIUS + 3), Math.sin(angle) * (FLYER_RADIUS + 3), 0);
    wheel.add(box);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 8).rotateX(Math.PI / 2), steel));
  // Two legs either side of the wheel, from the ground to the hub.
  for (const side of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2, FLYER_HUB * 1.05, 2), steel);
      leg.position.set(lean * 12, -FLYER_HUB / 2, side * 6);
      leg.rotation.z = lean * 0.13;
      wheel.add(leg);
    }
  }
  wheel.position.set(c.x, building.base + FLYER_HUB, c.z);
  // The wheel's face (+Z) towards the track.
  wheel.rotation.y = Math.atan2(near.x - c.x, near.z - c.z);
  group.add(wheel);
  return group;
}

/**
 * Marina Bay Sands' SkyPark: the long deck across the tops of its three towers (drawn with the
 * town), running past the end ones, its edge lit.
 */
export function createSkyPark(towers: readonly TownBuilding[]): THREE.Group {
  const centres = towers.map((t) => centroid(t.points));
  // The deck runs along the line through the two towers furthest apart.
  let [a, b] = [centres[0]!, centres[0]!];
  for (const p of centres) {
    for (const q of centres) {
      if (Math.hypot(p.x - q.x, p.z - q.z) > Math.hypot(a.x - b.x, a.z - b.z)) [a, b] = [p, q];
    }
  }
  const length = Math.hypot(b.x - a.x, b.z - a.z) + 2 * SKYPARK_OVERHANG;
  const top = Math.max(...towers.map((t) => t.base + t.height));
  const group = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(SKYPARK_WIDTH, SKYPARK_DEPTH, length),
    flat('#4a5560'),
  );
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(SKYPARK_WIDTH + 0.6, 2.5, length + 0.6),
    new THREE.MeshBasicMaterial({ color: '#d8f0ff', fog: false }),
  );
  edge.position.y = -SKYPARK_DEPTH / 2;
  group.add(deck, edge);
  group.position.set((a.x + b.x) / 2, top + SKYPARK_DEPTH / 2, (a.z + b.z) / 2);
  group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  return group;
}

/**
 * One of the Esplanade's "durians": low walls under a tall steel-grey shell over the footprint,
 * faceted like its spiky sunshades.
 */
export function createDurian(building: TownBuilding): THREE.Group {
  const { points, base } = building;
  const c = centroid(points);
  const along = points.map((p) => p.x - c.x);
  const across = points.map((p) => p.z - c.z);
  const rx = (Math.max(...along) - Math.min(...along)) / 2;
  const rz = (Math.max(...across) - Math.min(...across)) / 2;
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: DURIAN, flatShading: true }),
  );
  shell.scale.set(rx, Math.min(rx, rz) * DURIAN_RISE * 2, rz);
  shell.position.set(c.x, base, c.z);
  group.add(shell);
  return group;
}

/** The point of the track's centreline nearest to `p`. */
function nearestOnTrack(track: Track, p: Vec2): Vec2 {
  let best = track.samples[0]!.position;
  for (const s of track.samples) {
    if (
      Math.hypot(s.position.x - p.x, s.position.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)
    ) {
      best = s.position;
    }
  }
  return best;
}

/**
 * Las Vegas's Sphere: a lit LED ball on its footprint, sunk so its top is the building's height,
 * showing a pixel Earth (unlit, through the fog: it glows at night).
 */
export function createSphere(building: TownBuilding): THREE.Mesh {
  const c = centroid(building.points);
  const radius = Math.max(...building.points.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshBasicMaterial({ map: pixelEarth(), fog: false }),
  );
  ball.position.set(c.x, building.base + building.height - radius, c.z);
  return ball;
}

/** A 64 × 32 pixel Earth: blue ocean, green and sandy continents, white poles. Seeded. */
function pixelEarth(): THREE.Texture {
  const [w, h] = [64, 32];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(41);
  // Land: a few blobs of overlapping discs.
  const blobs = Array.from({ length: 9 }, () => ({
    x: random() * w,
    y: 6 + random() * (h - 12),
    r: 3 + random() * 6,
  }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const land = blobs.some((b) => Math.hypot(((x - b.x + w * 1.5) % w) - w / 2, y - b.y) < b.r);
      const pole = y < 3 || y > h - 4;
      ctx.fillStyle = pole
        ? '#f2f6fa'
        : land
          ? random() < 0.3
            ? '#c9b37a'
            : '#3f9a4a'
          : '#1d5fb8';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The Eiffel Tower's share of its height at each platform, and its legs' half-width (m). */
const EIFFEL_LEVELS = [0, 0.22, 0.47, 0.95] as const;
const EIFFEL_HALF = [1, 0.45, 0.24, 0.04] as const;
const EIFFEL_BASE = 22;

/**
 * Paris Las Vegas's Eiffel Tower (half the real one): three tapering lattice stages with two
 * platforms and an antenna, lit gold.
 */
export function createEiffel(building: TownBuilding): THREE.Group {
  const c = centroid(building.points);
  const top = building.height;
  const group = new THREE.Group();
  const lattice = new THREE.MeshBasicMaterial({
    map: latticeTexture(),
    color: '#ffd27a',
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const gold = new THREE.MeshBasicMaterial({ color: '#e8b75a' });
  for (let i = 0; i < 3; i++) {
    const [y0, y1] = [EIFFEL_LEVELS[i]! * top, EIFFEL_LEVELS[i + 1]! * top];
    // A square frustum: 4 radial segments, turned 45° so its faces are square to the axes.
    const r0 = EIFFEL_HALF[i]! * EIFFEL_BASE * Math.SQRT2;
    const r1 = EIFFEL_HALF[i + 1]! * EIFFEL_BASE * Math.SQRT2;
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 4, 1, true), lattice);
    stage.rotation.y = Math.PI / 4;
    stage.position.set(c.x, building.base + (y0 + y1) / 2, c.z);
    group.add(stage);
    if (i < 2) {
      const size = EIFFEL_HALF[i + 1]! * EIFFEL_BASE * 2.3;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(size, 2, size), gold);
      deck.position.set(c.x, building.base + y1, c.z);
      group.add(deck);
    }
  }
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.8, top * 0.05, 0.8), gold);
  antenna.position.set(c.x, building.base + top * 0.975, c.z);
  group.add(antenna);
  return group;
}

/** Cross-braced iron lattice: a frame and its diagonals, the rest see-through. */
function latticeTexture(): THREE.Texture {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, 2);
  ctx.fillRect(0, 0, 2, size);
  for (let i = 0; i < size; i++) {
    ctx.fillRect(i, i, 1, 1);
    ctx.fillRect(size - 1 - i, i, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 6);
  return texture;
}

/** The Fountains of Bellagio: jets per side of the lake, their tallest height (m). */
const FOUNTAIN_JETS = 28;
const FOUNTAIN_HEIGHT = 55;

/**
 * The Fountains of Bellagio: a row of lit water jets along the lake (the `lakes` ring holding the
 * landmark's middle) through its middle, rising and falling along the row, glowing through the fog.
 */
export function createFountains(
  building: TownBuilding,
  lakes: readonly (readonly Vec2[])[],
): THREE.Group {
  const c = centroid(building.points);
  const group = new THREE.Group();
  const lake = lakes.find((ring) => insidePolygon(c, ring));
  if (!lake) return group;
  // The row runs from the middle towards the lake's furthest shore and back the other way.
  const far = lake.reduce((a, p) =>
    Math.hypot(p.x - c.x, p.z - c.z) > Math.hypot(a.x - c.x, a.z - c.z) ? p : a,
  );
  const len = Math.hypot(far.x - c.x, far.z - c.z);
  const dir = { x: (far.x - c.x) / len, z: (far.z - c.z) / len };
  const water = new THREE.MeshBasicMaterial({
    color: '#dff3ff',
    transparent: true,
    opacity: 0.8,
    fog: false,
    depthWrite: false,
  });
  const jets = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1, 1.6), water, FOUNTAIN_JETS);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < FOUNTAIN_JETS; i++) {
    const t = (i / (FOUNTAIN_JETS - 1)) * 2 - 1; // −1 … 1 along the row
    const at = { x: c.x + dir.x * t * len * 0.8, z: c.z + dir.z * t * len * 0.8 };
    if (!insidePolygon(at, lake)) {
      m.compose(new THREE.Vector3(at.x, -10, at.z), q, new THREE.Vector3(0, 0, 0));
    } else {
      const height = FOUNTAIN_HEIGHT * (0.35 + 0.65 * Math.abs(Math.cos(t * Math.PI * 1.5)));
      m.compose(new THREE.Vector3(at.x, height / 2, at.z), q, new THREE.Vector3(1, height, 1));
    }
    jets.setMatrixAt(i, m);
  }
  group.add(jets);
  return group;
}

/** The Stratosphere: shaft radius, pod bottom and height (m). */
const STRAT_SHAFT = 10;
const STRAT_POD = 0.75;
const STRAT_POD_HEIGHT = 30;

/**
 * The Stratosphere, far up the Strip: a concrete shaft, the lit observation pod near the top and
 * its mast with a red beacon. The pod and the beacon glow through the fog: from the track, a light
 * high in the sky to the north.
 */
export function createStrat(building: TownBuilding): THREE.Group {
  const c = centroid(building.points);
  const top = building.base + building.height;
  const podY = building.base + building.height * STRAT_POD;
  const group = new THREE.Group();
  const concrete = new THREE.MeshLambertMaterial({ color: '#c9c4bb', flatShading: true });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(STRAT_SHAFT * 0.8, STRAT_SHAFT * 1.4, podY - building.base, 8),
    concrete,
  );
  shaft.position.set(c.x, (building.base + podY) / 2, c.z);
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(28, 22, STRAT_POD_HEIGHT, 12),
    new THREE.MeshBasicMaterial({ color: '#ffe3a6', fog: false }),
  );
  pod.position.set(c.x, podY + STRAT_POD_HEIGHT / 2, c.z);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 3, top - podY - STRAT_POD_HEIGHT, 6),
    new THREE.MeshBasicMaterial({ color: '#d9dde2', fog: false }),
  );
  mast.position.set(c.x, (podY + STRAT_POD_HEIGHT + top) / 2, c.z);
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 3),
    new THREE.MeshBasicMaterial({ color: '#ff2a1f', fog: false }),
  );
  beacon.position.set(c.x, top, c.z);
  group.add(shaft, pod, mast, beacon);
  return group;
}
