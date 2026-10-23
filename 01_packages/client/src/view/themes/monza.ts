import type * as THREE from 'three';
import type { Track, TrackSide } from '@altf1/shared';
import { createAsphaltTexture, createParkGrassTexture } from '../pixelTexture';
import { createGrandstand, createPitBuilding, face } from '../scenery/buildings';
import { createTrees } from '../scenery/nature';
import {
  alongTrack,
  footprintBox,
  polygonBounds,
  polylineFootprint,
  scatter,
  trackBounds,
  type Circle,
  type Footprint,
  type TrackSpot,
} from '../scenery/placement';
import { createOldRaceway, createPitLane } from '../scenery/realCircuit';
import {
  MONZA_OVAL,
  MONZA_OVAL_WIDTH,
  MONZA_PIT_BUILDINGS,
  MONZA_PIT_LANE,
  MONZA_STANDS,
  MONZA_WOODS,
} from './monzaLayout';
import type { TrackTheme, WallStyle } from './theme';

/** Concrete walls reach this far past a grandstand or the pit lane, either end (m). */
const CONCRETE_MARGIN = 15;
/** Trees: spacing in the woods and in the open park, and how many at most. */
const WOOD_SPACING = 9;
const PARK_SPACING = 24;
const MAX_WOOD_TREES = 2400;
const PARK_TREES = 500;
const TREE_MARGIN = 8;

/**
 * Monza, in the Parco di Monza: real grandstands, pit lane and pit buildings, woods and the old
 * high-speed oval from OpenStreetMap (positions in the generated monzaLayout.ts); guard rails,
 * concrete by the stands and the pits, tyres where there is gravel. See 01_docs/themes.md.
 */
export const MONZA_THEME: TrackTheme = {
  sky: '#8ec5f0',
  fog: { near: 450, far: 2200 },
  viewDistance: 2600,
  light: { sky: '#ffffff', ground: '#4a5a3a', intensity: 2.2, sun: 1 },
  ground: { texture: createParkGrassTexture, tile: 16, margin: 1500 },
  asphalt: createAsphaltTexture,
  kerb: { colors: ['#e10600', '#f4f4f4'], block: 1.5 },
  edgeLineInset: 0,
  wallStyle: monzaWalls,
  scenery: monzaScenery,
};

/** Stretches of one side of the track, as lap fractions (a stretch over the line is split). */
type Stretch = { readonly side: TrackSide; readonly from: number; readonly to: number };

function stretchOf(spots: readonly TrackSpot[], margin: number): Stretch[] {
  const side: TrackSide = spots[0]![1] >= 0 ? 'right' : 'left';
  const ats = spots.map(([at]) => at);
  let from = Math.min(...ats);
  let to = Math.max(...ats);
  if (to - from > 0.5) {
    // Over the line: the footprint is at both ends of the lap.
    from = Math.max(...ats.filter((a) => a < 0.5));
    to = Math.min(...ats.filter((a) => a >= 0.5));
    return [
      { side, from: to - margin, to: 1 },
      { side, from: 0, to: from + margin },
    ];
  }
  return [{ side, from: from - margin, to: to + margin }];
}

/** Concrete with a fence by the stands and the pit lane, tyres where there's gravel, else armco. */
function monzaWalls(track: Track): (index: number) => WallStyle {
  const margin = CONCRETE_MARGIN / track.length;
  const concrete = [
    ...MONZA_STANDS.flatMap((s) => stretchOf(s.footprint, margin)),
    ...stretchOf(MONZA_PIT_LANE.path, margin),
  ];
  const n = track.samples.length;
  return (index) => {
    const wall = track.walls[index]!;
    // `track.walls` holds the left side's segments, then the right's.
    const side: TrackSide = index < n ? 'left' : 'right';
    const at = wall.progress / track.length;
    if (concrete.some((s) => s.side === side && at >= s.from && at <= s.to)) return 'concrete';
    if (track.sides[side].runoff[wall.sample] === 'gravel') return 'tyres';
    return 'armco';
  };
}

/** Places an object built facing +Z with its front centre on a footprint's front. */
function placeOn(object: THREE.Object3D, box: Footprint): THREE.Object3D {
  object.position.set(box.front.x, 0, box.front.z);
  face(object, box.towardsTrack);
  return object;
}

/** A circle covering a footprint, to keep trees off it. */
function cover(box: Footprint): Circle {
  return {
    x: box.front.x - box.towardsTrack.x * (box.depth / 2),
    z: box.front.z - box.towardsTrack.z * (box.depth / 2),
    r: Math.max(box.length, box.depth) / 2 + 6,
  };
}

function monzaScenery(track: Track): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const keepClear: Circle[] = [];

  for (const stand of MONZA_STANDS) {
    const box = footprintBox(track, stand.footprint);
    objects.push(placeOn(createGrandstand(box.length), box));
    keepClear.push(cover(box));
  }
  for (const building of MONZA_PIT_BUILDINGS) {
    const box = footprintBox(track, building);
    const height = box.length > 150 ? 9 : 6;
    objects.push(placeOn(createPitBuilding(box.length, Math.max(8, box.depth), height), box));
    keepClear.push(cover(box));
  }

  objects.push(createPitLane(track, MONZA_PIT_LANE.path, MONZA_PIT_LANE.width));
  keepClear.push(
    ...polylineFootprint(alongTrack(track, MONZA_PIT_LANE.path, 8), MONZA_PIT_LANE.width / 2 + 4),
  );

  objects.push(createOldRaceway(track, MONZA_OVAL, MONZA_OVAL_WIDTH));
  for (const piece of MONZA_OVAL) {
    keepClear.push(...polylineFootprint(piece.points, MONZA_OVAL_WIDTH / 2 + 4, 8));
  }

  // The park: dense in the woods, sparse elsewhere.
  const options = { margin: TREE_MARGIN, avoid: keepClear };
  const trees = MONZA_WOODS.flatMap((wood, i) => {
    const bounds = polygonBounds(wood);
    const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    const count = Math.min(400, Math.round((area * 0.5) / WOOD_SPACING ** 2));
    return scatter(track, count, bounds, {
      ...options,
      seed: 101 + i,
      spacing: WOOD_SPACING,
      inside: wood,
    });
  }).slice(0, MAX_WOOD_TREES);
  const park = scatter(track, PARK_TREES, trackBounds(track, 350), {
    ...options,
    seed: 7,
    spacing: PARK_SPACING,
  });
  objects.push(createTrees([...trees, ...park], 5));
  return objects;
}
