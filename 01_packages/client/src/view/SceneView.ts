import * as THREE from 'three';
import {
  dot,
  forward,
  lerp,
  lerpAngle,
  locateOnTrack,
  placePuddles,
  slipAngle,
  type CarId,
  type CarState,
  type GameState,
  type Track,
  type Weather,
} from '@altf1/shared';
import { CameraRig } from './cameras/CameraRig';
import type { CameraParams } from './cameras/params';
import { CarView, type CarPose } from './CarView';
import { NameTag } from './NameTag';
import { LIVERIES, type Livery } from './pixelTexture';
import { elevatedGround, gridHeightAt, trackGroundHeight } from './scenery/ground';
import { trackBounds } from './scenery/placement';
import type { TrackTheme } from './themes/theme';
import { weatherLook } from './weather/look';
import { createPuddles } from './weather/puddles';
import { Raindrops, RAINDROP_PARAMS } from './weather/Raindrops';

/** How see-through the ghost car is (time trial). */
const GHOST_OPACITY = 0.35;

/** A ghost car to draw: `alpha` of the way between two of its recorded states. */
export interface GhostPose {
  readonly before: CarState;
  readonly after: CarState;
  readonly alpha: number;
}
import { createOwnBoxMark, createTrackView } from './TrackView';
import { FlagMarshal } from './FlagMarshal';
import { bindResize, createRenderer } from './renderer';

/** Owns the Three.js scene and draws it. Reads game state, never writes it. */
export class SceneView {
  private readonly renderer = createRenderer();
  private readonly scene = new THREE.Scene();
  private readonly cars = new Map<CarId, CarView>();
  /** Nickname over each opponent's car (multiplayer); never over the followed car. */
  private readonly tags = new Map<CarId, NameTag>();
  private names: Readonly<Record<CarId, string>> = {};
  private readonly liveries: Record<CarId, Livery>;
  private readonly cameraRig: CameraRig;
  /** Time trial's ghost, in the followed car's colours; created when first shown. */
  private ghostView: CarView | null = null;
  private ghost: GhostPose | null = null;
  /** A night race or the rain: every car (the ghost too) with its red rear lights lit. */
  private carLights: boolean;

  /**
   * `followId`: the car the camera follows (the local player; `follow` changes it). `liveries`: colour per car id, others
   * are grey (more can be added with `setLivery`). `cameraParams` are read live. The look comes from
   * the track's `theme` (`loadTheme`).
   */
  constructor(
    private readonly track: Track,
    private followId: CarId,
    liveries: Readonly<Record<CarId, Livery>>,
    cameraParams: CameraParams,
    theme: TrackTheme,
  ) {
    this.liveries = { ...liveries };
    this.carLights = theme.carLights ?? false;
    this.cameraRig = new CameraRig(cameraParams);
    this.cameraRig.camera.far = theme.viewDistance;
    this.cameraRig.camera.updateProjectionMatrix();
    this.theme = theme;
    this.scene.background = this.sky;
    this.scene.fog = this.fog;
    this.sun.position.set(0.4, 1, 0.25); // high, slightly to one side: lights facets unevenly
    this.scene.add(this.hemisphere, this.sun);
    // The camera is in the scene so the cockpit attached to it gets drawn.
    const ground = createGround(track, theme);
    const trackView = createTrackView(track, theme);
    this.scene.add(
      ground.object,
      trackView.object,
      ...theme.scenery(track, ground.height),
      this.cameraRig.camera,
    );
    for (const material of trackView.road) this.road.set(material, material.color.clone());
    const groundMaterials = [...trackView.ground, ...lambertMaterials(ground.object)];
    for (const material of groundMaterials) this.ground.set(material, material.color.clone());
    this.setWeather('dry');
    bindResize(this.renderer, this.cameraRig.camera);
  }

  private readonly theme: TrackTheme;
  private readonly sky = new THREE.Color();
  private readonly fog = new THREE.Fog('#ffffff');
  private readonly hemisphere = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight('#ffffff');
  /** The road's and the ground's materials, with their dry colours (the weather multiplies them). */
  private readonly road = new Map<THREE.MeshLambertMaterial, THREE.Color>();
  private readonly ground = new Map<THREE.MeshLambertMaterial, THREE.Color>();
  /** The puddles, built the first time it rains. */
  private puddles: THREE.Mesh | null = null;
  /** In the rain: every car on wet-weather tyres (the blue band). */
  private wetTyres = false;
  /** The falling rain, built the first time it rains; shown in the rain unless switched off (N). */
  private raindrops: Raindrops | null = null;
  private raining = false;
  private dropsOn = true;
  /** How the drops look; the dev panel edits it live. */
  readonly raindropParams = { ...RAINDROP_PARAMS };

  /**
   * Draws the track in `weather` from now on: the theme's own look when dry; in the rain an
   * overcast sky, a nearer haze, dimmer light, a darker wet road and ground, the puddles the
   * simulation places, every car's red rear lights lit and on wet tyres, and the falling rain
   * (01_docs/weather.md).
   */
  setWeather(weather: Weather): void {
    const look = weatherLook(this.theme, weather);
    this.sky.set(look.sky);
    this.fog.color.set(look.sky);
    this.fog.near = look.fog.near;
    this.fog.far = look.fog.far;
    this.hemisphere.color.set(look.light.sky);
    this.hemisphere.groundColor.set(look.light.ground);
    this.hemisphere.intensity = look.light.intensity;
    this.sun.intensity = look.light.sun;
    this.sun.visible = look.light.sun > 0;
    const tint = (materials: Map<THREE.MeshLambertMaterial, THREE.Color>, color: string) => {
      for (const [material, dry] of materials)
        material.color.copy(dry).multiply(new THREE.Color(color));
    };
    tint(this.road, look.road);
    tint(this.ground, look.ground);
    if (weather === 'rain' && !this.puddles) {
      this.puddles = createPuddles(this.track, placePuddles(this.track));
      this.scene.add(this.puddles);
    }
    // The rain lights the cars' rear lights, for visibility (owner); a night race always has them.
    this.carLights = (this.theme.carLights ?? false) || weather === 'rain';
    this.wetTyres = weather === 'rain';
    for (const view of [...this.cars.values(), this.ghostView]) {
      view?.setRearLights(this.carLights);
      view?.setWetTyres(this.wetTyres);
    }
    this.raining = weather === 'rain';
    if (this.raining && !this.raindrops) {
      this.raindrops = new Raindrops(this.raindropParams);
      this.scene.add(this.raindrops.object);
    }
    this.showRaindrops();
    if (this.puddles) {
      this.puddles.visible = weather === 'rain';
      (this.puddles.material as THREE.MeshBasicMaterial).color.set(look.sky);
    }
  }

  /** N: the falling rain on or off on this screen (the look only; the track stays wet). */
  toggleRaindrops(): void {
    this.dropsOn = !this.dropsOn;
    this.showRaindrops();
  }

  private showRaindrops(): void {
    if (this.raindrops) this.raindrops.object.visible = this.raining && this.dropsOn;
  }

  /** Points the camera at car `id` from now on (spectating another car, or back to the own one). */
  follow(id: CarId): void {
    this.followId = id;
  }

  /** Switches between the chase and the first-person camera. */
  toggleCamera(): void {
    this.cameraRig.toggle();
  }

  /** Colour for car `id` from now on; a car takes it when it first appears. */
  setLivery(id: CarId, livery: Livery): void {
    this.liveries[id] = livery;
  }

  /** Nickname tags shown over the other cars (multiplayer); cars without a name get none. */
  setNameTags(names: Readonly<Record<CarId, string>>): void {
    this.names = names;
    for (const [id, tag] of this.tags) {
      if (this.names[id] === undefined) this.removeTag(id, tag);
    }
  }

  /** Where the ghost car is drawn in the next frames; null hides it. Never a tag or a collision. */
  setGhost(ghost: GhostPose | null): void {
    this.ghost = ghost;
  }

  /** The own pit box, filled in yellow (a Grand Prix with its pit lane); null shows none. */
  markPitBox(box: number | null): void {
    if (box === this.pitBox) return;
    if (this.pitBoxMark) {
      this.scene.remove(this.pitBoxMark);
      this.pitBoxMark.geometry.dispose();
      (this.pitBoxMark.material as THREE.Material).dispose();
      this.pitBoxMark = null;
    }
    this.pitBox = box;
    if (box === null || !this.track.routes.some((road) => road.pit)) return;
    this.pitBoxMark = createOwnBoxMark(this.track, box);
    this.scene.add(this.pitBoxMark);
  }

  private pitBox: number | null = null;
  private pitBoxMark: THREE.Mesh | null = null;
  private flagMarshal: FlagMarshal | null = null;

  /** The flag marshal at the finish line (a Grand Prix's last lap); created when first shown. */
  showFlagMarshal(on: boolean): void {
    if (!on && !this.flagMarshal) return;
    if (!this.flagMarshal) {
      this.flagMarshal = new FlagMarshal(this.track);
      this.scene.add(this.flagMarshal.object);
    }
    this.flagMarshal.visible = on;
  }

  /** Looks behind the followed car while `on` (either camera). */
  setLookBack(on: boolean): void {
    this.cameraRig.lookBack = on;
  }

  /** Draws the world `alpha` of the way from `prev` to `curr`. */
  render(prev: GameState, curr: GameState, alpha: number, frameSeconds: number): void {
    for (const car of curr.cars) {
      const before = prev.cars.find((c) => c.id === car.id) ?? car;
      const pose = onRoad(this.track, interpolateCar(before, car, alpha));
      const view = this.carView(car.id);
      view.update(pose, frameSeconds);
      if (car.id === this.followId) {
        this.cameraRig.update(pose, frameSeconds, car.slipstream);
        view.setFirstPerson(this.cameraRig.mode === 'pov');
      }
    }
    this.renderGhost(frameSeconds);
    this.flagMarshal?.update(frameSeconds);
    // Tags after the camera moved, so they face it and size against its new position.
    for (const car of curr.cars) {
      if (car.id === this.followId) continue;
      const tag = this.tag(car.id);
      const pose = this.cars.get(car.id)!.object.position;
      tag?.update(pose.x, pose.y, pose.z, this.cameraRig.camera);
    }
    // Cars that left the race (e.g. the bot switched off).
    for (const [id, view] of this.cars) {
      if (curr.cars.some((car) => car.id === id)) continue;
      this.scene.remove(view.object);
      view.dispose();
      this.cars.delete(id);
      const tag = this.tags.get(id);
      if (tag) this.removeTag(id, tag);
    }
    if (this.raindrops?.object.visible) this.raindrops.update(this.cameraRig.camera, frameSeconds);
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  private renderGhost(frameSeconds: number): void {
    if (!this.ghost) {
      if (this.ghostView) this.ghostView.object.visible = false;
      return;
    }
    if (!this.ghostView) {
      this.ghostView = new CarView(
        this.liveries[this.followId] ?? LIVERIES.grey,
        GHOST_OPACITY,
        this.carLights,
      );
      this.ghostView.setWetTyres(this.wetTyres);
      this.scene.add(this.ghostView.object);
    }
    const { before, after, alpha } = this.ghost;
    this.ghostView.object.visible = true;
    this.ghostView.update(onRoad(this.track, interpolateCar(before, after, alpha)), frameSeconds);
  }

  /** NameTag for `id`, created when it first has a name; null if it has none. */
  private tag(id: CarId): NameTag | null {
    const name = this.names[id];
    if (name === undefined) return null;
    let tag = this.tags.get(id);
    if (!tag) {
      tag = new NameTag(name);
      this.tags.set(id, tag);
      this.scene.add(tag.object);
    }
    return tag;
  }

  private removeTag(id: CarId, tag: NameTag): void {
    this.scene.remove(tag.object);
    tag.dispose();
    this.tags.delete(id);
  }

  /** CarView for `id`, created the first time the car appears (opponents can join any time). */
  private carView(id: CarId): CarView {
    let view = this.cars.get(id);
    if (!view) {
      view = new CarView(this.liveries[id] ?? LIVERIES.grey, 1, this.carLights);
      view.setWetTyres(this.wetTyres);
      this.cars.set(id, view);
      this.scene.add(view.object);
    }
    return view;
  }
}

function interpolateCar(prev: CarState, curr: CarState, alpha: number): CarPose {
  const position = lerp(prev.position, curr.position, alpha);
  return {
    x: position.x,
    z: position.z,
    heading: lerpAngle(prev.heading, curr.heading, alpha),
    steer: prev.steer + (curr.steer - prev.steer) * alpha,
    forwardSpeed: dot(curr.velocity, forward(curr.heading)),
    slip: slipAngle(prev) + (slipAngle(curr) - slipAngle(prev)) * alpha,
    ...(curr.damage && { damage: curr.damage }),
  };
}

/**
 * A pose lifted onto the road on an elevated track (Monaco): the road's height under the car and
 * its pitch from the slope along the heading. Unchanged on a flat track.
 */
function onRoad(track: Track, pose: CarPose): CarPose {
  if (!track.elevated) return pose;
  const loc = locateOnTrack(track, { x: pose.x, z: pose.z });
  const along = dot(forward(pose.heading), loc.tangent);
  return { ...pose, y: loc.height, pitch: Math.atan(loc.grade * along) };
}

/** Every Lambert material in `object` (the ground's), once each. */
function lambertMaterials(object: THREE.Object3D): THREE.MeshLambertMaterial[] {
  const found = new Set<THREE.MeshLambertMaterial>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
      found.add(child.material);
    }
  });
  return [...found];
}

/** Ground cell size (m), see createGround. */
const GROUND_CELL = 50;

/** The ground's height at a point, as drawn (0 on a flat track): props stand on it. */
export type GroundHeight = (p: { readonly x: number; readonly z: number }) => number;

/**
 * Grass square under the whole circuit, `theme.ground.margin` m past it on every side. On an
 * elevated track, a grid following the theme's ground (`theme.groundHeight`, else the road's
 * heights around it: `trackGroundHeight`), settled under the road, over a square below its lowest
 * point. Returns it with its height as drawn.
 */
function createGround(
  track: Track,
  theme: TrackTheme,
): { readonly object: THREE.Object3D; readonly height: GroundHeight } {
  if (!track.elevated) return { object: createFlatGround(track, theme), height: () => 0 };
  const flat = createFlatGround(track, theme);
  const lowest = Math.min(...track.samples.map((s) => s.height));
  flat.position.y = lowest - 3;
  const grid = elevatedGround(
    track,
    (theme.groundHeight ?? trackGroundHeight)(track),
    theme.groundUnderRoutes ?? false,
  );
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const { highland } = theme.ground;
  const white = new THREE.Color('#ffffff');
  const tint = new THREE.Color(highland?.color ?? '#ffffff');
  const color = new THREE.Color();
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const x = grid.minX + c * grid.cell;
      const z = grid.minZ + r * grid.cell;
      const h = grid.heights[r * grid.cols + c]!;
      positions.push(x, h, z);
      uvs.push(x / theme.ground.tile, z / theme.ground.tile);
      const f = highland
        ? Math.min(1, Math.max(0, (h - highland.from) / (highland.to - highland.from)))
        : 0;
      color.copy(white).lerp(tint, f);
      colors.push(color.r, color.g, color.b);
    }
  }
  // The same split as `gridTriangle`: along each cell's diagonal from (c, r) to (c + 1, r + 1).
  const index: number[] = [];
  for (let r = 0; r < grid.rows - 1; r++) {
    for (let c = 0; c < grid.cols - 1; c++) {
      const a = r * grid.cols + c;
      const b = a + 1;
      const d = a + grid.cols;
      const e = d + 1;
      index.push(a, e, b, a, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const texture = theme.ground.texture();
  const group = new THREE.Group();
  group.add(
    flat,
    new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        map: texture,
        color: theme.ground.tint ?? '#ffffff',
        vertexColors: true,
      }),
    ),
  );
  return { object: group, height: (p) => gridHeightAt(grid, p.x, p.z) ?? lowest - 3 };
}

function createFlatGround(track: Track, theme: TrackTheme): THREE.Mesh {
  const bounds = trackBounds(track, theme.ground.margin);
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const texture = theme.ground.texture();
  texture.repeat.set(size / theme.ground.tile, size / theme.ground.tile);
  // Split into ~GROUND_CELL m cells: one huge quad loses depth precision near the camera and can
  // hide the track's surfaces just above it.
  const cells = Math.ceil(size / GROUND_CELL);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, cells, cells),
    new THREE.MeshLambertMaterial({ map: texture, color: theme.ground.tint ?? '#ffffff' }),
  );
  ground.rotation.x = -Math.PI / 2; // PlaneGeometry is vertical by default
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  return ground;
}
