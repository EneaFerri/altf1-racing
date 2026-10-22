import * as THREE from 'three';
import type { CarPose } from '../CarView';
import { CockpitView } from '../CockpitView';
import { ChaseCamera } from './ChaseCamera';
import { FirstPersonCamera } from './FirstPersonCamera';
import type { CameraParams } from './params';

export type CameraMode = 'chase' | 'pov';

/** Near plane (m): close enough for the cockpit drawn half a metre in front of the eye. */
const NEAR = 0.1;
const FAR = 300;

/** Field of view for a forward speed: `base` at rest, `base + gain` from `ref` m/s up (reversing = base). */
export function speedFov(base: number, gain: number, speed: number, ref: number): number {
  return base + gain * Math.min(1, Math.max(0, speed) / ref);
}

/** The one scene camera, driven by the chase or the first-person camera (toggle with V). */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private currentMode: CameraMode = 'chase';
  /** Smoothed field of view; null = jump straight to the target (start, camera switch). */
  private fov: number | null = null;
  private readonly chase: ChaseCamera;
  private readonly firstPerson: FirstPersonCamera;
  private readonly cockpit = new CockpitView();

  constructor(private readonly params: CameraParams) {
    this.camera = new THREE.PerspectiveCamera(
      params.fov,
      window.innerWidth / window.innerHeight,
      NEAR,
      FAR,
    );
    this.chase = new ChaseCamera(this.camera, params);
    this.firstPerson = new FirstPersonCamera(this.camera, params);
    this.camera.add(this.cockpit.object);
  }

  get mode(): CameraMode {
    return this.currentMode;
  }

  toggle(): void {
    this.currentMode = this.currentMode === 'chase' ? 'pov' : 'chase';
    this.chase.snap();
    this.fov = null;
  }

  update(pose: CarPose, frameSeconds: number): void {
    const p = this.params;
    const pov = this.currentMode === 'pov';
    const target = speedFov(
      pov ? p.povFov : p.fov,
      p.fovSpeedGain,
      pose.forwardSpeed,
      p.fovSpeedRef,
    );
    this.fov =
      this.fov === null
        ? target
        : this.fov + (target - this.fov) * (1 - Math.exp(-p.fovStiffness * frameSeconds));
    if (this.camera.fov !== this.fov) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.cockpit.object.visible = pov;
    if (pov) {
      this.firstPerson.update(pose);
      this.cockpit.update(pose.steer, this.camera);
    } else {
      this.chase.update(pose, frameSeconds);
    }
  }
}
