import type { Vec2 } from '@altf1/shared';
import * as THREE from 'three';
import { createAsphaltTexture, createParkGrassTexture } from '../pixelTexture';
import { createMountains, createTrees, createVolcanoes } from '../scenery/nature';
import {
  MEXICO_OVAL,
  MEXICO_OVAL_WIDTH,
  MEXICO_PIT_BUILDINGS,
  MEXICO_PIT_LANE,
  MEXICO_STADIUMS,
  MEXICO_STANDS,
  MEXICO_SURROUNDINGS,
  MEXICO_WOODS,
} from './mexicoLayout';
import { realCircuitTheme } from './realCircuitTheme';

/** Compass bearings from the circuit (degrees from north, clockwise) of the two volcanoes. */
const POPOCATEPETL = 131;
const IZTACCIHUATL = 118;
/** The volcanoes and the ring of the Valley of Mexico's mountains: distance from the centre (m). */
const VOLCANO_DISTANCE = 2200;
const RIDGE_DISTANCE = 1900;

/** A compass bearing (degrees) → an angle from +x towards +z in the game, given north. */
function bearingAngle(north: Vec2, degrees: number): number {
  const b = (degrees * Math.PI) / 180;
  // East is north turned a quarter clockwise seen from above.
  const x = north.x * Math.cos(b) - north.z * Math.sin(b);
  const z = north.z * Math.cos(b) + north.x * Math.sin(b);
  return Math.atan2(z, x);
}

/** The horizon of Mexico City: Popocatépetl and Iztaccíhuatl to the south-east, low ridges around. */
function valleyOfMexico(centre: Vec2, north: Vec2): THREE.Object3D {
  const popo = bearingAngle(north, POPOCATEPETL);
  const izta = bearingAngle(north, IZTACCIHUATL);
  const group = new THREE.Group();
  group.add(
    createVolcanoes(centre, [
      { bearing: popo, distance: VOLCANO_DISTANCE, height: 560, width: 620 },
      // Iztaccíhuatl, "the sleeping woman": a long massif of three summits.
      { bearing: izta - 0.04, distance: VOLCANO_DISTANCE, height: 430, width: 520 },
      { bearing: izta, distance: VOLCANO_DISTANCE + 60, height: 470, width: 480 },
      { bearing: izta + 0.04, distance: VOLCANO_DISTANCE, height: 400, width: 500 },
    ]),
    // Every other way, the lower, hazy ridges round the valley.
    createMountains(centre, RIDGE_DISTANCE, 31, {
      colors: ['#8e9aa6', '#97a2ad', '#87929e', '#a0aab4'],
      arc: [popo + 0.35, popo + Math.PI * 2 - 0.5],
    }),
  );
  return group;
}

/**
 * Mexico City (Autódromo Hermanos Rodríguez, in the Magdalena Mixiuhca sports park): the hazy blue
 * sky of 2240 m up, green park dense with broadleaf trees, the real grandstands and the GP's
 * temporary ones at the corners, the Foro Sol's bowl around turns 12–16 and the ballpark's in the
 * infield, the park's buildings (the Palacio de los Deportes' copper dome) and lakes, and the
 * volcanoes on the horizon (positions in the generated mexicoLayout.ts). See 01_docs/themes.md.
 */
export const MEXICO_THEME = realCircuitTheme(
  {
    stands: MEXICO_STANDS,
    pitLane: MEXICO_PIT_LANE,
    pitBuildings: MEXICO_PIT_BUILDINGS,
    woods: MEXICO_WOODS,
    oval: MEXICO_OVAL,
    ovalWidth: MEXICO_OVAL_WIDTH,
    stadiums: MEXICO_STADIUMS,
    surroundings: MEXICO_SURROUNDINGS,
  },
  {
    sky: '#9cc2e4',
    fog: { near: 380, far: 1900 },
    viewDistance: 2800,
    light: { sky: '#fff6e8', ground: '#5a6440', intensity: 2.3, sun: 1.2 },
    ground: { texture: createParkGrassTexture, tile: 16, margin: 1500 },
    asphalt: createAsphaltTexture,
    kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
    edgeLineInset: 0,
    trees: createTrees,
    parkTrees: 1500,
    backdrop: valleyOfMexico,
  },
);
