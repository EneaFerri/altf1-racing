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
import { ChaseCamera } from './cameras/ChaseCamera';
import { CarView, type CarPose } from './CarView';
import { createGroundTexture } from './pixelTexture';
import { createTrackView } from './TrackView';
import { bindResize, createRenderer } from './renderer';

const SKY_COLOR = '#87ceeb';
const GROUND_SIZE = 1000;
const GROUND_TILE = 2;

/** Owns the Three.js scene and draws it. Reads game state, never writes it. */
export class SceneView {
  private readonly renderer = createRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.3,
    300,
  );
  private readonly cars = new Map<CarId, CarView>();
  private readonly chaseCamera = new ChaseCamera(this.camera);

  /** `followId`: the car the camera follows (the local player). */
  constructor(
    track: Track,
    private readonly followId: CarId,
  ) {
    this.scene.background = new THREE.Color(SKY_COLOR);
    // Fog hides the ground's edge and gives depth.
    this.scene.fog = new THREE.Fog(SKY_COLOR, 60, 250);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 2.5));
    this.scene.add(createGround(), createTrackView(track));
    bindResize(this.renderer, this.camera);
  }

  /** Draws the world `alpha` of the way from `prev` to `curr`. */
  render(prev: GameState, curr: GameState, alpha: number, frameSeconds: number): void {
    for (const car of curr.cars) {
      const before = prev.cars.find((c) => c.id === car.id) ?? car;
      const pose = interpolateCar(before, car, alpha);
      this.carView(car.id).update(pose, frameSeconds);
      if (car.id === this.followId) this.chaseCamera.update(pose, frameSeconds);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** CarView for `id`, created the first time the car appears (opponents can join any time). */
  private carView(id: CarId): CarView {
    let view = this.cars.get(id);
    if (!view) {
      view = new CarView();
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
