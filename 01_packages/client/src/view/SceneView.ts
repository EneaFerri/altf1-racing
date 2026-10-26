import * as THREE from 'three';
import {
  dot,
  forward,
  lerp,
  lerpAngle,
  slipAngle,
  type CarId,
  type CarState,
  type GameState,
  type Track,
} from '@altf1/shared';
import { CameraRig } from './cameras/CameraRig';
import type { CameraParams } from './cameras/params';
import { CarView, type CarPose } from './CarView';
import { NameTag } from './NameTag';
import { LIVERIES, type Livery } from './pixelTexture';
import { trackBounds } from './scenery/placement';
import { themeFor, type TrackTheme } from './themes/theme';
import { createTrackView } from './TrackView';
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

  /**
   * `followId`: the car the camera follows (the local player). `liveries`: colour per car id, others
   * are grey (more can be added with `setLivery`). `cameraParams` are read live. The look comes from
   * the track's theme (`themeFor`).
   */
  constructor(
    track: Track,
    private readonly followId: CarId,
    liveries: Readonly<Record<CarId, Livery>>,
    cameraParams: CameraParams,
  ) {
    this.liveries = { ...liveries };
    const theme = themeFor(track.name);
    this.cameraRig = new CameraRig(cameraParams);
    this.cameraRig.camera.far = theme.viewDistance;
    this.cameraRig.camera.updateProjectionMatrix();
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.sky, theme.fog.near, theme.fog.far);
    this.scene.add(
      new THREE.HemisphereLight(theme.light.sky, theme.light.ground, theme.light.intensity),
    );
    if (theme.light.sun > 0) {
      const sun = new THREE.DirectionalLight('#ffffff', theme.light.sun);
      sun.position.set(0.4, 1, 0.25); // high, slightly to one side: lights facets unevenly
      this.scene.add(sun);
    }
    // The camera is in the scene so the cockpit attached to it gets drawn.
    this.scene.add(
      createGround(track, theme),
      createTrackView(track, theme),
      ...theme.scenery(track),
      this.cameraRig.camera,
    );
    bindResize(this.renderer, this.cameraRig.camera);
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

  /** Looks behind the followed car while `on` (either camera). */
  setLookBack(on: boolean): void {
    this.cameraRig.lookBack = on;
  }

  /** Draws the world `alpha` of the way from `prev` to `curr`. */
  render(prev: GameState, curr: GameState, alpha: number, frameSeconds: number): void {
    for (const car of curr.cars) {
      const before = prev.cars.find((c) => c.id === car.id) ?? car;
      const pose = interpolateCar(before, car, alpha);
      const view = this.carView(car.id);
      view.update(pose, frameSeconds);
      if (car.id === this.followId) {
        this.cameraRig.update(pose, frameSeconds, car.slipstream);
        view.setFirstPerson(this.cameraRig.mode === 'pov');
      }
    }
    // Tags after the camera moved, so they face it and size against its new position.
    for (const car of curr.cars) {
      if (car.id === this.followId) continue;
      const tag = this.tag(car.id);
      const pose = this.cars.get(car.id)!.object.position;
      tag?.update(pose.x, pose.z, this.cameraRig.camera);
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
    this.renderer.render(this.scene, this.cameraRig.camera);
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
      view = new CarView(this.liveries[id] ?? LIVERIES.grey);
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
  };
}

/** Ground cell size (m), see createGround. */
const GROUND_CELL = 50;

/** Grass square under the whole circuit, `theme.ground.margin` m past it on every side. */
function createGround(track: Track, theme: TrackTheme): THREE.Mesh {
  const bounds = trackBounds(track, theme.ground.margin);
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const texture = theme.ground.texture();
  texture.repeat.set(size / theme.ground.tile, size / theme.ground.tile);
  // Split into ~GROUND_CELL m cells: one huge quad loses depth precision near the camera and can
  // hide the track's surfaces just above it.
  const cells = Math.ceil(size / GROUND_CELL);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, cells, cells),
    new THREE.MeshLambertMaterial({ map: texture }),
  );
  ground.rotation.x = -Math.PI / 2; // PlaneGeometry is vertical by default
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  return ground;
}
