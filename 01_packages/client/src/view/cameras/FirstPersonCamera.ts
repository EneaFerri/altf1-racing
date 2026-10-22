import * as THREE from 'three';
import { toWorld } from '@altf1/shared';
import type { CarPose } from '../CarView';
import type { CameraParams } from './params';

/** Driver's-eye camera, locked to the car (no smoothing): what the car does, the view does. */
export class FirstPersonCamera {
  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly params: CameraParams,
  ) {}

  update(pose: CarPose): void {
    const p = this.params;
    const eye = toWorld({ x: pose.x, z: pose.z }, pose.heading, p.eyeAhead, 0);
    this.camera.position.set(eye.x, p.eyeHeight, eye.z);
    // Yaw first, then pitch: the camera looks down -Z like the car, so rotation.y = heading.
    this.camera.rotation.set(p.pitch, pose.heading, 0, 'YXZ');
  }
}
