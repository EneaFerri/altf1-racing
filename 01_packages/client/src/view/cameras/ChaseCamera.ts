import * as THREE from 'three';
import { forward, lerpAngle } from '@altf1/shared';
import type { CarPose } from '../CarView';
import type { CameraParams } from './params';

/**
 * Third-person camera behind the car. Only its yaw is smoothed, so the distance stays
 * constant at any speed while turns still show the car's flank.
 */
export class ChaseCamera {
  private yaw: number | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly params: CameraParams,
  ) {}

  /** Forget the smoothed yaw: the next update starts right behind the car (e.g. after a camera switch). */
  snap(): void {
    this.yaw = null;
  }

  update(pose: CarPose, frameSeconds: number): void {
    const p = this.params;
    // Frame-rate independent exponential smoothing.
    this.yaw =
      this.yaw === null
        ? pose.heading
        : lerpAngle(this.yaw, pose.heading, 1 - Math.exp(-p.yawStiffness * frameSeconds));

    const behind = forward(this.yaw);
    this.camera.position.set(
      pose.x - behind.x * p.distance,
      p.height,
      pose.z - behind.z * p.distance,
    );
    this.camera.lookAt(
      pose.x + behind.x * p.lookAhead,
      p.lookHeight,
      pose.z + behind.z * p.lookAhead,
    );
  }
}
