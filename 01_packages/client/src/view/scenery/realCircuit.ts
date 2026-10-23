import * as THREE from 'three';
import type { Track, Vec2 } from '@altf1/shared';
import { createAsphaltTexture, createConcreteTexture } from '../pixelTexture';
import { polylineRibbon, surfaceBetween } from '../ribbon';
import { alongTrack, clearance, type TrackSpot } from './placement';

// Builders for the real circuits' surroundings (data from OpenStreetMap, see 01_docs/themes.md).

const ASPHALT_TILE = 12;
const CONCRETE_TILE = 3;
const Y_PIT_LINE = 0.015;
const Y_PIT_LANE = 0.02;
/** White line along each edge of the pit lane (m). */
const PIT_LINE = 0.5;
const PARAPET_HEIGHT = 1;
/** One bridge pier every this many oval points (5 m apart). */
const PIER_EVERY = 4;
const PIER_SIZE = 1.6;

/**
 * Decorative pit lane behind the wall: asphalt with a white line along each edge. Not drivable
 * (yet): the physics wall stands between it and the track.
 */
export function createPitLane(
  track: Track,
  path: readonly TrackSpot[],
  width: number,
): THREE.Group {
  const points = alongTrack(track, path, 4);
  const group = new THREE.Group();
  group.add(
    polylineRibbon(
      points,
      width,
      Y_PIT_LINE,
      new THREE.MeshLambertMaterial({ color: '#f2f2f2' }),
      ASPHALT_TILE,
    ),
    polylineRibbon(
      points,
      width - 2 * PIT_LINE,
      Y_PIT_LANE,
      new THREE.MeshLambertMaterial({ map: createAsphaltTexture() }),
      ASPHALT_TILE,
    ),
  );
  return group;
}

/** A piece of an old raceway: centreline, deck height and bank angle at each point. */
export interface RacewayPiece {
  readonly points: readonly Vec2[];
  readonly height: readonly number[];
  readonly bank: readonly number[];
}

/**
 * An old raceway (Monza's high-speed oval), view only: a concrete deck `width` m wide, banked in
 * the curves (outside raised), on embankments where it is above the ground beside the track, on a
 * bridge with piers (outside the walls) where it crosses the track; low parapets along both edges.
 */
export function createOldRaceway(
  track: Track,
  pieces: readonly RacewayPiece[],
  width: number,
): THREE.Group {
  const concrete = new THREE.MeshLambertMaterial({
    map: createConcreteTexture(),
    side: THREE.DoubleSide,
  });
  const deckMaterial = new THREE.MeshLambertMaterial({
    map: createAsphaltTexture(),
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  for (const piece of pieces) {
    const { left, right } = edges(piece, width);
    group.add(surfaceBetween(left, right, deckMaterial, ASPHALT_TILE));
    for (const edge of [left, right]) {
      const top = edge.map((p) => p.clone().setY(p.y + PARAPET_HEIGHT));
      group.add(surfaceBetween(edge, top, concrete, CONCRETE_TILE));
      // Embankment down to the ground, except where the deck spans the track.
      const runs = splitWhere(edge, (p) => p.y > 0.05 && clearance(track, flat(p)) > 0);
      for (const run of runs) {
        group.add(
          surfaceBetween(
            run.map((p) => p.clone().setY(0)),
            run,
            concrete,
            CONCRETE_TILE,
          ),
        );
      }
    }
    group.add(createPiers(track, piece, left, right, concrete));
  }
  return group;
}

/** Left and right deck edges (3D): the curve's outside raised by the bank angle. */
function edges(piece: RacewayPiece, width: number) {
  const half = width / 2;
  const { points } = piece;
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // Same side convention as polylineRibbon: `n` is the second edge's side.
    const nx = -dz / len;
    const nz = dx / len;
    const a = points[Math.max(0, i - 4)]!;
    const c = points[Math.min(points.length - 1, i + 4)]!;
    // Turning towards +n (positive cross) puts the outside on the -n edge.
    const turn = (p.x - a.x) * (c.z - p.z) - (p.z - a.z) * (c.x - p.x);
    const rise = width * Math.sin(piece.bank[i]!);
    const h = piece.height[i]!;
    left.push(new THREE.Vector3(p.x - nx * half, h + (turn > 0 ? rise : 0), p.z - nz * half));
    right.push(new THREE.Vector3(p.x + nx * half, h + (turn > 0 ? 0 : rise), p.z + nz * half));
  });
  return { left, right };
}

/** Piers under the raised deck, at both edges, only where they stand outside the walls. */
function createPiers(
  track: Track,
  piece: RacewayPiece,
  left: readonly THREE.Vector3[],
  right: readonly THREE.Vector3[],
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  piece.height.forEach((h, i) => {
    if (h < 1 || i % PIER_EVERY !== 0) return;
    for (const edge of [left[i]!, right[i]!]) {
      if (clearance(track, flat(edge)) < PIER_SIZE) continue;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(PIER_SIZE, edge.y, PIER_SIZE), material);
      pier.position.set(edge.x, edge.y / 2, edge.z);
      group.add(pier);
    }
  });
  return group;
}

/** The runs of consecutive points for which `keep` holds. */
function splitWhere<T>(points: readonly T[], keep: (p: T) => boolean): T[][] {
  const runs: T[][] = [];
  let run: T[] = [];
  for (const p of points) {
    if (keep(p)) run.push(p);
    else if (run.length > 0) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const flat = (p: THREE.Vector3): Vec2 => ({ x: p.x, z: p.z });
