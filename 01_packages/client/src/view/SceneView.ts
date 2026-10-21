import * as THREE from 'three';
import { dot, forward, lerp, lerpAngle, type GameState } from '@altf1/shared';
import { ChaseCamera } from './cameras/ChaseCamera';
import { CarView, type CarPose } from './CarView';
import { createGroundTexture } from './pixelTexture';
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
    0.1,
    300,
  );
  private readonly car = new CarView();
  private readonly chaseCamera = new ChaseCamera(this.camera);

  constructor() {
    this.scene.background = new THREE.Color(SKY_COLOR);
    // Fog hides the ground's edge and gives depth.
    this.scene.fog = new THREE.Fog(SKY_COLOR, 60, 250);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 2.5));
    this.scene.add(createGround());
    this.scene.add(this.car.object);
    bindResize(this.renderer, this.camera);
  }

  /** Draws the world `alpha` of the way from `prev` to `curr`. */
  render(prev: GameState, curr: GameState, alpha: number, frameSeconds: number): void {
    const pose = interpolateCar(prev, curr, alpha);
    this.car.update(pose, frameSeconds);
    this.chaseCamera.update(pose, frameSeconds);
    this.renderer.render(this.scene, this.camera);
  }
}

function interpolateCar(prev: GameState, curr: GameState, alpha: number): CarPose {
  const position = lerp(prev.car.position, curr.car.position, alpha);
  const heading = lerpAngle(prev.car.heading, curr.car.heading, alpha);
  return {
    x: position.x,
    z: position.z,
    heading,
    steer: prev.car.steer + (curr.car.steer - prev.car.steer) * alpha,
    forwardSpeed: dot(curr.car.velocity, forward(curr.car.heading)),
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
