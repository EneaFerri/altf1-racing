import * as THREE from 'three';
import type { CarPose } from '../CarView';
import { CockpitView } from '../CockpitView';
import { WindLines } from '../WindLines';
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

/** Turn of the view round the car's heading (rad): π while looking back, else 0. */
export function viewYawOffset(lookBack: boolean): number {
  return lookBack ? Math.PI : 0;
}

/**
 * The one scene camera, driven by the chase or the first-person camera (toggle with V); either
 * one looks behind the car while `lookBack` is set (Z held). Carries the screen overlays: the
 * cockpit (first person) and the slipstream wind lines (both views).
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Set every frame from the look-back key; the flip is instant both ways. */
  lookBack = false;
  private currentMode: CameraMode = 'chase';
  /** Smoothed field of view; null = jump straight to the target (start, camera switch). */
  private fov: number | null = null;
  private readonly chase: ChaseCamera;
  private readonly firstPerson: FirstPersonCamera;
  private readonly cockpit = new CockpitView();
  private readonly wind = new WindLines();

  constructor(private readonly params: CameraParams) {
    this.camera = new THREE.PerspectiveCamera(
      params.fov,
      window.innerWidth / window.innerHeight,
      NEAR,
      FAR,
    );
    this.chase = new ChaseCamera(this.camera, params);
    this.firstPerson = new FirstPersonCamera(this.camera, params);
    this.camera.add(this.cockpit.object, this.wind.object);
  }

  get mode(): CameraMode {
    return this.currentMode;
  }

  toggle(): void {
    this.currentMode = this.currentMode === 'chase' ? 'pov' : 'chase';
    this.chase.snap();
    this.fov = null;
  }

  /** `slipstream`: the followed car's tow (0..1), shown as wind lines while looking ahead. */
  update(pose: CarPose, frameSeconds: number, slipstream: number): void {
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

    const yawOffset = viewYawOffset(this.lookBack);
    // Looking back from the cockpit, the wheel would hang in front of the rear view.
    this.cockpit.object.visible = pov && !this.lookBack;
    if (pov) {
      this.firstPerson.update(pose, yawOffset);
      this.cockpit.update(pose.steer, this.camera);
    } else {
      this.chase.update(pose, frameSeconds, yawOffset);
    }
    // The air rushes past the way the car goes: no streaks in the rear view.
    this.wind.update(this.lookBack ? 0 : slipstream, frameSeconds, this.camera);
  }
}
