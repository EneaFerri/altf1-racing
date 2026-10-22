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
import { createGroundTexture } from './pixelTexture';
import { createTrackView } from './TrackView';
import { bindResize, createRenderer } from './renderer';

const SKY_COLOR = '#87ceeb';
/** Every car but the followed one is greyed out, until cars get their own liveries. */
const OTHER_CAR_TINT = '#8a8a8a';
const GROUND_SIZE = 1000;
const GROUND_TILE = 2;

/** Owns the Three.js scene and draws it. Reads game state, never writes it. */
export class SceneView {
  private readonly renderer = createRenderer();
  private readonly scene = new THREE.Scene();
  private readonly cars = new Map<CarId, CarView>();
  private readonly cameraRig: CameraRig;

  /** `followId`: the car the camera follows (the local player). `cameraParams` are read live. */
  constructor(
    track: Track,
    private readonly followId: CarId,
    cameraParams: CameraParams,
  ) {
    this.cameraRig = new CameraRig(cameraParams);
    this.scene.background = new THREE.Color(SKY_COLOR);
    // Fog hides the ground's edge and gives depth.
    this.scene.fog = new THREE.Fog(SKY_COLOR, 60, 250);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 2.5));
    // The camera is in the scene so the cockpit attached to it gets drawn.
    this.scene.add(createGround(), createTrackView(track), this.cameraRig.camera);
    bindResize(this.renderer, this.cameraRig.camera);
  }

  /** Switches between the chase and the first-person camera. */
  toggleCamera(): void {
    this.cameraRig.toggle();
  }

  /** Draws the world `alpha` of the way from `prev` to `curr`. */
  render(prev: GameState, curr: GameState, alpha: number, frameSeconds: number): void {
    for (const car of curr.cars) {
      const before = prev.cars.find((c) => c.id === car.id) ?? car;
      const pose = interpolateCar(before, car, alpha);
      const view = this.carView(car.id);
      view.update(pose, frameSeconds);
      if (car.id === this.followId) {
        this.cameraRig.update(pose, frameSeconds);
        view.setFirstPerson(this.cameraRig.mode === 'pov');
      }
    }
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  /** CarView for `id`, created the first time the car appears (opponents can join any time). */
  private carView(id: CarId): CarView {
    let view = this.cars.get(id);
    if (!view) {
      view = new CarView(id === this.followId ? undefined : OTHER_CAR_TINT);
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

function createGround(): THREE.Mesh {
  const texture = createGroundTexture();
  texture.repeat.set(GROUND_SIZE / GROUND_TILE, GROUND_SIZE / GROUND_TILE);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ map: texture }),
  );
  ground.rotation.x = -Math.PI / 2; // PlaneGeometry is vertical by default
  return ground;
}
