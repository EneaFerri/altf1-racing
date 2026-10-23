import type * as THREE from 'three';
import type { Track, TrackSide, Vec2 } from '@altf1/shared';
import { createGrandstand, createPitBuilding, face } from '../scenery/buildings';
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
import { createOldRaceway, createPitLane, type RacewayPiece } from '../scenery/realCircuit';
import type { TrackTheme, WallStyle } from './theme';

/** Concrete walls reach this far past a grandstand or the pit lane, either end (m). */
const CONCRETE_MARGIN = 15;
/** Trees: spacing in the woods and in the open park, and how many at most. */
const WOOD_SPACING = 9;
const PARK_SPACING = 24;
const MAX_WOOD_TREES = 2400;
const MAX_TREES_PER_WOOD = 400;
const PARK_TREES = 500;
const TREE_MARGIN = 8;

/** A real circuit's surroundings, as `01_tools/openf1/scenery.ts` generates them (`<id>Layout.ts`). */
export interface RealCircuitScenery {
  readonly stands: readonly { readonly name: string; readonly footprint: readonly TrackSpot[] }[];
  readonly pitLane: { readonly width: number; readonly path: readonly TrackSpot[] };
  readonly pitBuildings: readonly (readonly TrackSpot[])[];
  readonly woods: readonly (readonly Vec2[])[];
  readonly oval: readonly RacewayPiece[];
  readonly ovalWidth: number;
}

/** What differs between real circuits' looks: sky, light, ground, kerbs, and their trees. */
export type RealCircuitLook = Omit<TrackTheme, 'wallStyle' | 'scenery'> & {
  readonly trees: (spots: readonly Vec2[], seed: number) => THREE.Object3D;
};

/**
 * The theme of a real circuit: its OSM scenery (stands, pit lane and buildings, old raceways, trees
 * dense in the woods and sparse in the open) and walls by place, drawn with `look`. See
 * 01_docs/themes.md.
 */
export function realCircuitTheme(scenery: RealCircuitScenery, look: RealCircuitLook): TrackTheme {
  const { trees, ...theme } = look;
  return {
    ...theme,
    wallStyle: (track) => wallsByPlace(track, scenery),
    scenery: (track) => buildScenery(track, scenery, trees),
  };
}

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
function wallsByPlace(track: Track, scenery: RealCircuitScenery): (index: number) => WallStyle {
  const margin = CONCRETE_MARGIN / track.length;
  const concrete = [
    ...scenery.stands.flatMap((s) => stretchOf(s.footprint, margin)),
    ...stretchOf(scenery.pitLane.path, margin),
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

function buildScenery(
  track: Track,
  scenery: RealCircuitScenery,
  trees: RealCircuitLook['trees'],
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const keepClear: Circle[] = [];

  for (const stand of scenery.stands) {
    const box = footprintBox(track, stand.footprint);
    objects.push(placeOn(createGrandstand(box.length), box));
    keepClear.push(cover(box));
  }
  for (const building of scenery.pitBuildings) {
    const box = footprintBox(track, building);
    const height = box.length > 150 ? 9 : 6;
    objects.push(placeOn(createPitBuilding(box.length, Math.max(8, box.depth), height), box));
    keepClear.push(cover(box));
  }

  const { pitLane } = scenery;
  objects.push(createPitLane(track, pitLane.path, pitLane.width));
  keepClear.push(...polylineFootprint(alongTrack(track, pitLane.path, 8), pitLane.width / 2 + 4));

  if (scenery.oval.length > 0) {
    objects.push(createOldRaceway(track, scenery.oval, scenery.ovalWidth));
    for (const piece of scenery.oval) {
      keepClear.push(...polylineFootprint(piece.points, scenery.ovalWidth / 2 + 4, 8));
    }
  }

  // Dense in the woods, sparse elsewhere.
  const options = { margin: TREE_MARGIN, avoid: keepClear };
  const inWoods = scenery.woods
    .flatMap((wood, i) => {
      const bounds = polygonBounds(wood);
      const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
      const count = Math.min(MAX_TREES_PER_WOOD, Math.round((area * 0.5) / WOOD_SPACING ** 2));
      return scatter(track, count, bounds, {
        ...options,
        seed: 101 + i,
        spacing: WOOD_SPACING,
        inside: wood,
      });
    })
    .slice(0, MAX_WOOD_TREES);
  const inPark = scatter(track, PARK_TREES, trackBounds(track, 350), {
    ...options,
    seed: 7,
    spacing: PARK_SPACING,
  });
  objects.push(trees([...inWoods, ...inPark], 5));
  return objects;
}
