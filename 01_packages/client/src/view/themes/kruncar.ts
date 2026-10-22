import type * as THREE from 'three';
import { KRUNCAR, locateOnTrack, vec2, type Track } from '@altf1/shared';
import { createLimeGrassTexture, createSpeckledAsphaltTexture } from '../pixelTexture';
import {
  createBarn,
  createCoveredBridge,
  createFloodlight,
  createGrandstand,
  face,
} from '../scenery/buildings';
import { createBalloons, createMountains, createRiver, createTrees } from '../scenery/nature';
import {
  besideTrack,
  polylineFootprint,
  scatter,
  trackBounds,
  type Circle,
} from '../scenery/placement';
import { createChevronBoards, createDeck, createHayStacks } from '../scenery/trackside';
import {
  KRUNCAR_BARN,
  KRUNCAR_BRIDGES,
  KRUNCAR_CONCRETE,
  KRUNCAR_HAY,
  KRUNCAR_RIVERS,
  KRUNCAR_STANDS,
} from './kruncarLayout';
import type { TrackTheme, WallStyle } from './theme';

/** Grandstands sit this far behind the wall (m). */
const STAND_GAP = 3;
const TREE_COUNT = 260;

/**
 * Kruncar, after the Krunker.io map "KrunCar": mint sky, grey low-poly mountains, light speckled
 * asphalt, pink/white kerbs, lime grass, wooden fences, grandstands, river and wooden bridges.
 * Palette and props in 01_docs/themes.md; positions in kruncarLayout.ts.
 */
export const KRUNCAR_THEME: TrackTheme = {
  sky: '#bfe8d8',
  fog: { near: 350, far: 1600 },
  viewDistance: 2600,
  light: { sky: '#ffffff', ground: '#6a7a5a', intensity: 2, sun: 1.2 },
  ground: { texture: createLimeGrassTexture, tile: 16, margin: 1500 },
  asphalt: createSpeckledAsphaltTexture,
  kerb: { colors: ['#f2a0a0', '#ffffff'], block: 2 },
  edgeLineInset: 0.6,
  wallStyle: kruncarWalls,
  scenery: kruncarScenery,
};

/** Concrete wall with chain fence along the main straight (grandstands), wooden fence elsewhere. */
function kruncarWalls(track: Track): (index: number) => WallStyle {
  const n = track.samples.length;
  const from = locateOnTrack(track, KRUNCAR.points[KRUNCAR_CONCRETE.fromPoint]!.at).distance;
  const to = locateOnTrack(track, KRUNCAR.points[KRUNCAR_CONCRETE.toPoint]!.at).distance;
  // The stretch wraps over the start line: from `from` to the end, then 0 to `to`.
  return (index) => {
    const d = track.samples[index % n]!.distance;
    return d >= from || d <= to ? 'concrete' : 'fence';
  };
}

function kruncarScenery(track: Track): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const keepClear: Circle[] = [];

  for (const river of KRUNCAR_RIVERS) {
    objects.push(createRiver(river.path, river.width, river.pond));
    keepClear.push(...polylineFootprint(river.path, river.width / 2 + 6), {
      ...river.pond,
      r: river.pond.r + 6,
    });
  }

  for (const bridge of KRUNCAR_BRIDGES) {
    objects.push(createDeck(track, bridge.at, bridge.length));
    if (bridge.covered) {
      const loc = locateOnTrack(track, bridge.at);
      // Posts on the wall line, so no car can drive through them.
      const roof = createCoveredBridge(2 * (loc.halfWidth + track.runoffWidth), bridge.length - 4);
      roof.position.set(loc.point.x, 0, loc.point.z);
      face(roof, loc.tangent);
      objects.push(roof);
    }
  }

  for (const stand of KRUNCAR_STANDS) {
    const spot = besideTrack(track, stand.near, stand.side, STAND_GAP, stand.along);
    const grandstand = createGrandstand(stand.length);
    grandstand.position.set(spot.position.x, 0, spot.position.z);
    face(grandstand, spot.towardsTrack);
    objects.push(grandstand);
    for (const end of [-1, 1]) {
      const light = besideTrack(
        track,
        stand.near,
        stand.side,
        STAND_GAP + 12,
        stand.along + (end * stand.length) / 2,
      );
      const tower = createFloodlight();
      tower.position.set(light.position.x, 0, light.position.z);
      face(tower, light.towardsTrack);
      objects.push(tower);
      keepClear.push({ x: light.position.x, z: light.position.z, r: 6 });
    }
    keepClear.push({ x: spot.position.x, z: spot.position.z, r: stand.length / 2 + 12 });
  }

  const barn = createBarn();
  barn.position.set(KRUNCAR_BARN.position.x, 0, KRUNCAR_BARN.position.z);
  barn.rotation.y = KRUNCAR_BARN.rotation;
  objects.push(barn, createHayStacks(KRUNCAR_HAY, 5));
  keepClear.push(
    { x: KRUNCAR_BARN.position.x, z: KRUNCAR_BARN.position.z, r: 18 },
    ...KRUNCAR_HAY.map((h) => ({ x: h.x, z: h.z, r: 7 })),
  );

  objects.push(createChevronBoards(track));

  const bounds = trackBounds(track, 220);
  const trees = scatter(track, TREE_COUNT, bounds, {
    seed: 11,
    margin: 7,
    spacing: 13,
    avoid: keepClear,
  });
  const centre = vec2((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2);
  const reach = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
  objects.push(
    createTrees(trees, 3),
    createMountains(centre, reach + 350, 7),
    createBalloons(
      [vec2(-150, -420), vec2(330, -260), vec2(520, 160), vec2(60, 420), vec2(-260, 120)],
      9,
    ),
  );
  return objects;
}
