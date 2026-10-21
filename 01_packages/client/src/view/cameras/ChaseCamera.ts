import * as THREE from 'three';
import { forward, lerpAngle } from '@altf1/shared';
import type { CarPose } from '../CarView';

const DISTANCE = 7;
const HEIGHT = 2.5;
const LOOK_AHEAD = 2;
const LOOK_HEIGHT = 1;
/** How quickly the camera swings round behind the car (1/s). Lower = lazier, more of the car's side shows in turns. */
const YAW_STIFFNESS = 5;

/**
 * Third-person camera behind the car. Only its yaw is smoothed, so the distance stays
 * constant at any speed while turns still show the car's flank.
 */
export class ChaseCamera {
  private yaw: number | null = null;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  update(pose: CarPose, frameSeconds: number): void {
    // Frame-rate independent exponential smoothing.
    this.yaw =
      this.yaw === null
        ? pose.heading
        : lerpAngle(this.yaw, pose.heading, 1 - Math.exp(-YAW_STIFFNESS * frameSeconds));

    const behind = forward(this.yaw);
    this.camera.position.set(pose.x - behind.x * DISTANCE, HEIGHT, pose.z - behind.z * DISTANCE);
    this.camera.lookAt(pose.x + behind.x * LOOK_AHEAD, LOOK_HEIGHT, pose.z + behind.z * LOOK_AHEAD);
  }
}
