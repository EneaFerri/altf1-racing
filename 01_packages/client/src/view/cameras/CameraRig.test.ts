import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CarPose } from '../CarView';
import { ChaseCamera } from './ChaseCamera';
import { FirstPersonCamera } from './FirstPersonCamera';
import { CAMERA_PARAMS } from './params';
import { speedFov, viewYawOffset } from './CameraRig';

describe('viewYawOffset', () => {
  it('turns the view half a circle only while looking back', () => {
    expect(viewYawOffset(false)).toBe(0);
    expect(viewYawOffset(true)).toBe(Math.PI);
  });
});

describe('speedFov', () => {
  it('is the base field of view at rest and grows up to base + gain at the reference speed', () => {
    expect(speedFov(70, 10, 0, 70)).toBe(70);
    expect(speedFov(70, 10, 35, 70)).toBe(75);
    expect(speedFov(70, 10, 70, 70)).toBe(80);
    expect(speedFov(70, 10, 90, 70)).toBe(80);
  });

  it('stays at the base when reversing', () => {
    expect(speedFov(70, 10, -8, 70)).toBe(70);
  });
});

describe('cameras on an elevated road (Monaco v2)', () => {
  const pose: CarPose = { x: 10, z: -20, heading: 0, steer: 0, forwardSpeed: 30, slip: 0 };

  it('rise with the road under the car, the same height above it', () => {
    const cameras = [
      (c: THREE.PerspectiveCamera, p: CarPose) =>
        new ChaseCamera(c, CAMERA_PARAMS).update(p, 1 / 60, 0),
      (c: THREE.PerspectiveCamera, p: CarPose) =>
        new FirstPersonCamera(c, CAMERA_PARAMS).update(p, 0),
    ];
    for (const place of cameras) {
      const flat = new THREE.PerspectiveCamera();
      const high = new THREE.PerspectiveCamera();
      place(flat, pose);
      place(high, { ...pose, y: 30 });
      expect(high.position.y - flat.position.y).toBeCloseTo(30, 5);
      expect(high.position.x).toBeCloseTo(flat.position.x, 5);
    }
  });

  it("tilts the driver's view with the car up a climb, the other way looking back", () => {
    const level = new THREE.PerspectiveCamera();
    const climb = new THREE.PerspectiveCamera();
    const back = new THREE.PerspectiveCamera();
    new FirstPersonCamera(level, CAMERA_PARAMS).update(pose, 0);
    new FirstPersonCamera(climb, CAMERA_PARAMS).update({ ...pose, pitch: 0.1 }, 0);
    new FirstPersonCamera(back, CAMERA_PARAMS).update({ ...pose, pitch: 0.1 }, Math.PI);
    expect(climb.rotation.x - level.rotation.x).toBeCloseTo(0.1, 5);
    expect(back.rotation.x - level.rotation.x).toBeCloseTo(-0.1, 5);
  });
});
