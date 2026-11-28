import * as THREE from 'three';
import type { Track, Vec2 } from '@altf1/shared';
import { createLimestoneTexture } from '../pixelTexture';
import type { Ground } from './onGround';
import { alongTrack, type TrackSpot } from './placement';

// Old town walls beside a street circuit (Baku's Icherisheher, beside the castle section), placed
// by hand along the track (OSM maps few of them; see 01_docs/themes.md), standing on the ground.

/** An old town wall as `01_tools/openf1/scenery.ts` generates it (`<id>Layout.ts`). */
export interface CityWall {
  readonly name: string;
  /** To the top of the battlements, and across (m). */
  readonly height: number;
  readonly thickness: number;
  /** Its centreline, behind the barrier. */
  readonly path: readonly TrackSpot[];
}

/** Points along the wall this far apart; battlements (m: spacing, size); round towers (m). */
const STEP = 2;
const MERLON_SPACING = 2.4;
const MERLON = { width: 1.2, height: 1.3, depth: 0.9 };
const TOWER_SPACING = 34;
const TOWER_RADIUS = 3.4;
const TOWER_RISE = 1.8;
/** Under the ground (m): the wall never floats where the ground dips between its points. */
const FOOTING = 1;
/** Facade texture repeat (m). */
const TILE = 3.2;

/**
 * The walls: honey limestone in ashlar courses, battlements along the top on the side away from
 * the track, and a round tower every TOWER_SPACING m standing out behind it.
 */
export function createCityWalls(
  track: Track,
  walls: readonly CityWall[],
  ground: Ground = () => 0,
): THREE.Group {
  const stone = new THREE.MeshLambertMaterial({
    map: createLimestoneTexture(),
    side: THREE.DoubleSide,
  });
  const positions: number[] = [];
  const uvs: number[] = [];
  const quad = (a: Vec2, b: Vec2, bottom: number, top: number, u0: number): void => {
    const u1 = u0 + Math.hypot(b.x - a.x, b.z - a.z) / TILE;
    const [v0, v1] = [bottom / TILE, top / TILE];
    positions.push(a.x, bottom, a.z, b.x, bottom, b.z, a.x, top, a.z);
    positions.push(a.x, top, a.z, b.x, bottom, b.z, b.x, top, b.z);
    uvs.push(u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1);
  };
  const group = new THREE.Group();
  for (const wall of walls) {
    const line = alongTrack(track, wall.path, STEP);
    const half = wall.thickness / 2;
    const body = wall.height - MERLON.height;
    // Each point's side direction: across the wall, away from the track (the path's sign).
    const away = Math.sign(wall.path[0]?.[1] ?? 1);
    const sides = line.map((p, i) => {
      const a = line[Math.max(0, i - 1)]!;
      const b = line[Math.min(line.length - 1, i + 1)]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: (-(b.z - a.z) / len) * away, z: ((b.x - a.x) / len) * away };
    });
    const offset = (i: number, by: number): Vec2 => ({
      x: line[i]!.x + sides[i]!.x * by,
      z: line[i]!.z + sides[i]!.z * by,
    });
    let u = 0;
    for (let i = 0; i + 1 < line.length; i++) {
      const step = Math.hypot(line[i + 1]!.x - line[i]!.x, line[i + 1]!.z - line[i]!.z);
      for (const by of [-half, half]) quad(offset(i, by), offset(i + 1, by), -FOOTING, body, u);
      // The walkway on top, as a flat quad.
      const [a, b, c, d] = [
        offset(i, -half),
        offset(i + 1, -half),
        offset(i, half),
        offset(i + 1, half),
      ];
      positions.push(a.x, body, a.z, b.x, body, b.z, c.x, body, c.z);
      positions.push(c.x, body, c.z, b.x, body, b.z, d.x, body, d.z);
      uvs.push(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1);
      u += step / TILE;
    }
    // The ends closed.
    for (const i of [0, line.length - 1])
      quad(offset(i, -half), offset(i, half), -FOOTING, body, 0);

    // Battlements on the outer edge, and round towers.
    let along = 0;
    let nextMerlon = 0;
    let nextTower = TOWER_SPACING / 2;
    for (let i = 0; i + 1 < line.length; i++) {
      const step = Math.hypot(line[i + 1]!.x - line[i]!.x, line[i + 1]!.z - line[i]!.z);
      const angle = Math.atan2(line[i + 1]!.x - line[i]!.x, line[i + 1]!.z - line[i]!.z);
      while (nextMerlon < along + step) {
        const f = (nextMerlon - along) / step;
        const p = offset(i, half - MERLON.depth / 2);
        const q = offset(i + 1, half - MERLON.depth / 2);
        const merlon = new THREE.Mesh(
          new THREE.BoxGeometry(MERLON.depth, MERLON.height, MERLON.width),
          stone,
        );
        const at = { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f };
        merlon.position.set(at.x, ground(at) + body + MERLON.height / 2, at.z);
        merlon.rotation.y = angle;
        group.add(merlon);
        nextMerlon += MERLON_SPACING;
      }
      if (nextTower < along + step) {
        const f = (nextTower - along) / step;
        const p = offset(i, half + TOWER_RADIUS * 0.4);
        const q = offset(i + 1, half + TOWER_RADIUS * 0.4);
        const height = wall.height + TOWER_RISE + FOOTING;
        const tower = new THREE.Mesh(
          new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS * 1.12, height, 12),
          stone,
        );
        const at = { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f };
        tower.position.set(at.x, ground(at) + height / 2 - FOOTING, at.z);
        group.add(tower);
        nextTower += TOWER_SPACING;
      }
      along += step;
    }
  }
  // Every vertex on the ground under it.
  for (let k = 0; k < positions.length; k += 3) {
    positions[k + 1]! += ground({ x: positions[k]!, z: positions[k + 2]! });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, stone));
  return group;
}
