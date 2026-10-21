import * as THREE from 'three';
import { createCheckerTexture, createGroundTexture } from './pixelTexture';
import { bindResize, createRenderer } from './renderer';

const GROUND_SIZE = 200;
const GROUND_TILE = 2;

/** Owns the Three.js scene and draws it. Reads game state, never writes it. */
export class SceneView {
  private readonly renderer = createRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  constructor() {
    this.scene.background = new THREE.Color('#87ceeb');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 2.5));
    this.scene.add(createGround());
    // Stand-in for the car until the car model arrives in step 2.
    this.scene.add(createPlaceholderCar());

    this.camera.position.set(0, 3, 6);
    this.camera.lookAt(0, 0.5, 0);
    bindResize(this.renderer, this.camera);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
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

function createPlaceholderCar(): THREE.Mesh {
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ map: createCheckerTexture() }),
  );
  cube.position.y = 0.5;
  return cube;
}
