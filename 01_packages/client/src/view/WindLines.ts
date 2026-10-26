import * as THREE from 'three';

/** Distance of the streaks' plane in front of the eye (m); beyond the near plane, before the cockpit. */
const DEPTH = 0.45;
/** Drawn after the world and without depth test, but under the cockpit overlay (CockpitView: 1000). */
const RENDER_ORDER = 900;
const COUNT = 14;
/** Opacity of a streak at 100% slipstream: clearly visible, still see-through. */
const MAX_OPACITY = 0.5;
/** Streak size in screen units (1 = half the screen height). */
const WIDTH = 0.009;
const MIN_LENGTH = 0.16;
const MAX_LENGTH = 0.3;
/**
 * Streaks are born this far from the centre and fade out past this radius (screen units, x also
 * scaled by the aspect), so most of their life is on screen, along the sides.
 */
const INNER_RADIUS = 0.4;
const OUTER_RADIUS = 1.05;
/** Laps of a streak's life per second: it flows outward, like air rushing past. */
const FLOW_RATE = 1.6;
/** Directions the streaks come from (rad, 0 = right, counter-clockwise): the sides of the screen,
 * never straight up (the HUD) or straight down (the car). */
const ANGLES = [-0.55, -0.25, 0.05, 0.35, 0.6].flatMap((a) => [a, Math.PI - a]);

/** Opacity of the streaks for a slipstream factor 0..1: grows in step with the HUD percentage. */
export function windLineOpacity(factor: number): number {
  return MAX_OPACITY * Math.min(1, Math.max(0, factor));
}

/**
 * Light wind streaks around the edges of the screen while the followed car is in a slipstream.
 * Attached to the camera and laid out in screen units like CockpitView, so they look the same in
 * the chase and first-person views; their strength follows the same factor as the HUD's SLIP %.
 */
export class WindLines {
  readonly object = new THREE.Group();
  private readonly streaks: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }[] = [];
  /** Life of each streak, 0..1 (born near the centre → gone past the edge). */
  private readonly phases: number[] = [];

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = RENDER_ORDER;
      mesh.frustumCulled = false;
      mesh.rotation.z = ANGLES[i % ANGLES.length]!;
      this.object.add(mesh);
      this.streaks.push({ mesh, material });
      // Spread evenly in time so they never pulse together.
      this.phases.push((i * 0.618) % 1);
    }
    this.object.visible = false;
  }

  /** Call every frame: `factor` is the followed car's slipstream (0 hides the streaks). */
  update(factor: number, frameSeconds: number, camera: THREE.PerspectiveCamera): void {
    const opacity = windLineOpacity(factor);
    this.object.visible = opacity > 0;
    if (!this.object.visible) return;

    const halfHeight = DEPTH * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    this.object.position.set(0, 0, -DEPTH);
    this.object.scale.setScalar(halfHeight);
    const length = MIN_LENGTH + (MAX_LENGTH - MIN_LENGTH) * factor;
    this.streaks.forEach(({ mesh, material }, i) => {
      const phase = (this.phases[i]! + FLOW_RATE * frameSeconds) % 1;
      this.phases[i] = phase;
      const angle = mesh.rotation.z;
      const radius = INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) * phase;
      // Wider screens push the side streaks out to the edges.
      mesh.position.set(Math.cos(angle) * radius * camera.aspect, Math.sin(angle) * radius, 0);
      mesh.scale.set(length, WIDTH, 1);
      // Fade in at birth and out at the edge, so no streak pops.
      material.opacity = opacity * Math.sin(Math.PI * phase);
    });
  }
}
