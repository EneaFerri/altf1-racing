import * as THREE from 'three';
import { createCheckerTexture, createLiveryTexture } from './pixelTexture';

/** Interpolated car pose handed to the View each frame. */
export interface CarPose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly steer: number;
  /** Signed forward speed (m/s), used to spin the wheels. */
  readonly forwardSpeed: number;
  /** Slip angle (rad), used to lean the body outwards in slides. */
  readonly slip: number;
}

const WHEEL_RADIUS = 0.36;
/** Visual front-wheel angle at full lock (rad). Purely cosmetic. */
const MAX_WHEEL_STEER = 0.4;
/** Body roll per radian of slip. Purely cosmetic (~4° at max drift angle). */
const ROLL_PER_SLIP = 0.1;

/**
 * Low-poly F1 car built from boxes, in local space: forward is -Z, right is +X, up is +Y,
 * so `rotation.y = heading` matches the simulation directly.
 */
export class CarView {
  readonly object = new THREE.Group();
  private readonly frontPivots: THREE.Group[] = [];
  private readonly wheels: THREE.Mesh[] = [];

  constructor() {
    const livery = new THREE.MeshLambertMaterial({ map: createLiveryTexture() });
    const carbon = new THREE.MeshLambertMaterial({ color: '#1c1c1c' });
    const tyre = new THREE.MeshLambertMaterial({
      map: createCheckerTexture(8, '#1a1a1a', '#3a3a3a'),
    });

    // [width, height, length, x, y, z, material]
    const parts: [number, number, number, number, number, number, THREE.Material][] = [
      [0.9, 0.5, 3.0, 0, 0.45, 0.2, livery], // monocoque
      [0.5, 0.3, 1.4, 0, 0.35, -2.1, livery], // nose
      [1.9, 0.08, 0.4, 0, 0.15, -2.7, carbon], // front wing
      [1.6, 0.4, 1.6, 0, 0.4, 0.3, livery], // sidepods
      [0.5, 0.25, 0.8, 0, 0.8, -0.2, carbon], // cockpit
      [0.4, 0.4, 1.2, 0, 0.85, 0.7, livery], // engine cover
      [1.4, 0.08, 0.5, 0, 1.1, 1.9, carbon], // rear wing
      [0.05, 0.5, 0.5, -0.7, 0.9, 1.9, carbon], // rear wing endplates
      [0.05, 0.5, 0.5, 0.7, 0.9, 1.9, carbon],
      [0.1, 0.4, 0.1, 0, 0.85, 1.75, carbon], // rear wing post
    ];
    for (const [w, h, l, x, y, z, material] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
      mesh.position.set(x, y, z);
      this.object.add(mesh);
    }

    // [x, z, width, steers]
    const wheelSpecs: [number, number, number, boolean][] = [
      [-0.95, -1.5, 0.4, true],
      [0.95, -1.5, 0.4, true],
      [-0.95, 1.4, 0.5, false],
      [0.95, 1.4, 0.5, false],
    ];
    for (const [x, z, width, steers] of wheelSpecs) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, width, 8),
        tyre,
      );
      wheel.rotation.order = 'ZXY';
      wheel.rotation.z = Math.PI / 2; // cylinder axis along X = the axle
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_RADIUS, z);
      pivot.add(wheel);
      this.object.add(pivot);
      this.wheels.push(wheel);
      if (steers) this.frontPivots.push(pivot);
    }
  }

  update(pose: CarPose, frameSeconds: number): void {
    this.object.position.set(pose.x, 0, pose.z);
    this.object.rotation.y = pose.heading;
    // Euler order XYZ applies roll (local Z) before yaw: the car leans to the outside of the slide.
    this.object.rotation.z = pose.slip * ROLL_PER_SLIP;

    // Steering right (+) turns the wheels clockwise seen from above (negative Y rotation).
    for (const pivot of this.frontPivots) pivot.rotation.y = -pose.steer * MAX_WHEEL_STEER;
    const spin = (pose.forwardSpeed * frameSeconds) / WHEEL_RADIUS;
    for (const wheel of this.wheels) wheel.rotation.x -= spin;
  }
}
