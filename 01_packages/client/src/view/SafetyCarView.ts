import * as THREE from 'three';
import type { CarPose } from './CarView';
import {
  createSafetyCarPlateTexture,
  createSafetyCarSideTexture,
  SAFETY_CAR_COLORS,
} from './pixelTexture';

const WHEEL_RADIUS = 0.34;
/** Visual front-wheel angle at full lock (rad), as CarView's. */
const MAX_WHEEL_STEER = 0.4;
/** The light bar flashes left, right, this many times a second. */
const FLASH_RATE = 4;
const AMBER = '#ffa20a';
const LAMP_OFF = '#3a3326';

/**
 * The safety car (R.3; the owner's photo): a red GT coupé in the game's low-poly look, black roof
 * and bonnet vents, the light bar on the roof (amber, flashing while it leads the field; out on
 * its last lap), a big rear wing, black wheels with a red line, the white flame and `SAFETY CAR`
 * on its flanks and plates. No maker's badge. Local axes as CarView's: forward −Z, right +X.
 * Reads state only.
 */
export class SafetyCarView {
  readonly object = new THREE.Group();
  private readonly frontPivots: THREE.Group[] = [];
  private readonly wheels: THREE.Mesh[] = [];
  private readonly lamps: THREE.MeshBasicMaterial[] = [];
  private lightsOn = false;
  private seconds = 0;

  constructor() {
    const { red, black } = SAFETY_CAR_COLORS;
    const paint = new THREE.MeshLambertMaterial({ color: red });
    const side = new THREE.MeshLambertMaterial({ map: createSafetyCarSideTexture() });
    const carbon = new THREE.MeshLambertMaterial({ color: black });
    const glass = new THREE.MeshLambertMaterial({ color: '#1d2630' });
    const plate = new THREE.MeshLambertMaterial({ map: createSafetyCarPlateTexture() });
    /** A plate's box: the lettering on face `face` only (BoxGeometry: +X −X +Y −Y +Z −Z). */
    const plateAt = (face: number): THREE.Material[] =>
      Array.from({ length: 6 }, (_, i) => (i === face ? plate : carbon));
    const head = new THREE.MeshBasicMaterial({ color: '#eef3ff' });
    const tail = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });

    // [width, height, length, x, y, z, material(s)]; the body's flanks carry the livery.
    const flanks = [side, side, paint, carbon, paint, paint];
    const parts: [
      number,
      number,
      number,
      number,
      number,
      number,
      THREE.Material | THREE.Material[],
    ][] = [
      [1.96, 0.5, 4.5, 0, 0.47, 0, flanks], // body
      [1.9, 0.14, 1.75, 0, 0.78, -1.3, paint], // bonnet
      [0.32, 0.03, 0.9, -0.42, 0.86, -1.25, carbon], // bonnet vents
      [0.32, 0.03, 0.9, 0.42, 0.86, -1.25, carbon],
      [1.96, 0.18, 0.5, 0, 0.3, -2.3, carbon], // grille and splitter
      [0.55, 0.12, 0.04, 0, 0.42, -2.56, plateAt(5)], // front plate (its face: −Z)
      [1.5, 0.42, 1.75, 0, 0.98, 0.3, glass], // cabin
      [1.36, 0.06, 1.15, 0, 1.22, 0.35, carbon], // roof
      [1.86, 0.16, 1.15, 0, 0.8, 1.7, paint], // rear deck
      [0.55, 0.12, 0.04, 0, 0.5, 2.26, plateAt(4)], // rear plate (+Z)
      [0.06, 0.32, 0.2, -0.6, 1.02, 2.0, carbon], // rear wing posts
      [0.06, 0.32, 0.2, 0.6, 1.02, 2.0, carbon],
      [1.9, 0.05, 0.38, 0, 1.2, 2.05, carbon], // rear wing
      [0.05, 0.22, 0.42, -0.95, 1.14, 2.05, carbon], // its endplates
      [0.05, 0.22, 0.42, 0.95, 1.14, 2.05, carbon],
      [0.2, 0.1, 0.18, -1.05, 0.98, -0.45, carbon], // mirrors
      [0.2, 0.1, 0.18, 1.05, 0.98, -0.45, carbon],
      [0.36, 0.1, 0.05, -0.68, 0.6, -2.26, head], // headlights
      [0.36, 0.1, 0.05, 0.68, 0.6, -2.26, head],
      [0.4, 0.08, 0.05, -0.66, 0.72, 2.26, tail], // tail lights
      [0.4, 0.08, 0.05, 0.66, 0.72, 2.26, tail],
      [1.1, 0.07, 0.24, 0, 1.28, 0.05, carbon], // light bar
    ];
    for (const [w, h, l, x, y, z, material] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
      mesh.position.set(x, y, z);
      this.object.add(mesh);
    }
    // The windscreen and the rear window, sloped.
    for (const [z, tilt] of [
      [-0.78, -0.62],
      [1.25, 0.5],
    ] as const) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 0.7), glass);
      pane.position.set(0, 1.0, z);
      pane.rotation.x = tilt;
      this.object.add(pane);
    }
    // The light bar's lamps: two amber at the ends, flashing in turn.
    for (const x of [-0.38, 0.38]) {
      const lamp = new THREE.MeshBasicMaterial({ color: LAMP_OFF });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.2), lamp);
      mesh.position.set(x, 1.33, 0.05);
      this.object.add(mesh);
      this.lamps.push(lamp);
    }
    // Black wheels: the tyre, a thin red line round the rim, the dark rim inside it.
    const tyre = new THREE.MeshLambertMaterial({ color: black });
    const rim = new THREE.MeshLambertMaterial({ color: '#26262b' });
    const line = new THREE.MeshLambertMaterial({ color: red });
    /** A disc `radius` (share of the wheel's) a little proud of the last, `faces` on its sides. */
    const disc = (radius: number, width: number, faces: THREE.Material): THREE.Mesh => {
      const r = WHEEL_RADIUS * radius;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 12), [
        tyre,
        faces,
        faces,
      ]);
      mesh.rotation.z = Math.PI / 2; // its axis along X: the axle
      return mesh;
    };
    for (const [ahead, sideX] of [
      [1.4, -0.86],
      [1.4, 0.86],
      [-1.35, -0.86],
      [-1.35, 0.86],
    ] as const) {
      const wheel = new THREE.Group();
      const parts = [disc(1, 0.3, tyre), disc(0.74, 0.305, line), disc(0.68, 0.31, rim)];
      wheel.add(...parts);
      this.wheels.push(...parts);
      const pivot = new THREE.Group();
      pivot.position.set(sideX, WHEEL_RADIUS, -ahead);
      pivot.add(wheel);
      this.object.add(pivot);
      if (ahead > 0) this.frontPivots.push(pivot);
    }
    this.setLights(false);
  }

  /** Its light bar on (leading the field) or off (its last lap, or going in). */
  setLights(on: boolean): void {
    this.lightsOn = on;
    if (!on) for (const lamp of this.lamps) lamp.color.set(LAMP_OFF);
  }

  update(pose: CarPose, frameSeconds: number): void {
    this.object.position.set(pose.x, pose.y ?? 0, pose.z);
    this.object.rotation.set(pose.pitch ?? 0, pose.heading, 0, 'YXZ');
    for (const pivot of this.frontPivots) pivot.rotation.y = -pose.steer * MAX_WHEEL_STEER;
    const spin = (pose.forwardSpeed * frameSeconds) / WHEEL_RADIUS;
    for (const wheel of this.wheels) wheel.rotation.x -= spin;
    this.seconds += frameSeconds;
    if (this.lightsOn) {
      const left = Math.floor(this.seconds * FLASH_RATE * 2) % 2 === 0;
      this.lamps[0]!.color.set(left ? AMBER : LAMP_OFF);
      this.lamps[1]!.color.set(left ? LAMP_OFF : AMBER);
    }
  }

  /** The same calls as a CarView (SceneView treats every car alike); the safety car ignores them. */
  setFirstPerson(_firstPerson: boolean): void {}
  setRearLights(_on: boolean): void {}
  setWetTyres(_wet: boolean): void {}

  dispose(): void {
    this.object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const materials = (
        Array.isArray(node.material) ? node.material : [node.material]
      ) as THREE.MeshLambertMaterial[];
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
    });
  }
}
