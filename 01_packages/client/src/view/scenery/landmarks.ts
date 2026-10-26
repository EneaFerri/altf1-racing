import * as THREE from 'three';
import type { Track, Vec2 } from '@altf1/shared';
import { createBelleEpoqueTexture, createFacadeTexture } from '../pixelTexture';
import { clearance } from './placement';
import { extrude, type TownBuilding } from './town';

// Landmarks of a town circuit, each on its real OSM footprint (Monaco: see 01_docs/themes.md).

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
