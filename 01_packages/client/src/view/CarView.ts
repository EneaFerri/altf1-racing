import * as THREE from 'three';
import { CAR_WHEELS, type CarDamage, type TyreCompound } from '@altf1/shared';
import { damageLook } from './carDamageLook';
import {
  createBandSidewallTexture,
  createCheckerTexture,
  createLiveryTexture,
  createWetSidewallTexture,
  TYRE_BANDS,
  type Livery,
} from './pixelTexture';

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
  /** Height of the road under the car (m; left out on a flat track: 0). */
  readonly y?: number;
  /** Nose-up angle from the slope along the heading (rad; left out on a flat track: 0). */
  readonly pitch?: number;
  /** The car's damage (Grand Prix only); left out: drawn as new. */
  readonly damage?: CarDamage;
  /** Its tyres' compound (Grand Prix only): the sidewalls' band; left out: none. */
  readonly compound?: TyreCompound;
}

const WHEEL_RADIUS = 0.36;
/** Visual front-wheel angle at full lock (rad). Purely cosmetic. */
const MAX_WHEEL_STEER = 0.4;
/** Body roll per radian of slip. Purely cosmetic (~2° at full lock). */
const ROLL_PER_SLIP = 0.1;
/** A fully flat tyre is drawn this much lower (share of its height). */
const FLAT_SQUASH = 0.35;
/** Front wing: half its span, height and position (local; forward is −Z). */
const FRONT_WING = { halfSpan: 0.95, y: 0.15, z: -2.7 } as const;

/** Which camera a body part is drawn for, see `CarView.setFirstPerson`. */
type PartKind = 'body' | 'tip' | 'cockpit';

/**
 * Low-poly F1 car built from boxes, in local space: forward is -Z, right is +X, up is +Y,
 * so `rotation.y = heading` matches the simulation directly.
 */
export class CarView {
  readonly object = new THREE.Group();
  private readonly frontPivots: THREE.Group[] = [];
  private readonly wheels: THREE.Mesh[] = [];
  /** Everything but the nose and front wing: hidden in first person, where only the tip shows. */
  private readonly body: THREE.Object3D[] = [];
  /** Slim front tub shown only in first person, linking the nose to the steering wheel. */
  private readonly cockpit: THREE.Object3D[] = [];
  /** Damage: the front wing's halves (hinged at the nose), the rear wing, every wheel's pivot. */
  private readonly wingHalves: { left: THREE.Group; right: THREE.Group };
  private readonly rearWing: THREE.Mesh;
  private readonly pivots: THREE.Group[] = [];
  /** The damage drawn now (redrawn only when it changes). */
  private damage: CarDamage | undefined;
  private firstPerson = false;
  /** The red rear lights (and the crash structure holding them), shown only while lit. */
  private readonly rearLights: THREE.Object3D[] = [];
  private lightsOn = false;
  /** The wheels' flat ends: the tread's checker when dry, the wets' blue band in the rain. */
  private readonly sidewall: THREE.MeshLambertMaterial;
  private readonly dryTyre: THREE.Texture;
  private readonly wetSidewall = createWetSidewallTexture();
  /** The compounds' sidewalls (red softs, yellow mediums), made the first time one is shown. */
  private readonly bandSidewalls = new Map<TyreCompound, THREE.Texture>();
  private wet = false;
  private compound: TyreCompound | undefined;

  /**
   * `opacity` < 1 draws a see-through car (time trial's ghost) that never hides what's behind it.
   * `rearLights`: the red lights of a night race or the rain, lit (01_docs/themes.md,
   * 01_docs/weather.md); `setRearLights` switches them later.
   */
  constructor(colors: Livery, opacity = 1, rearLights = false) {
    const see = opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {};
    const livery = new THREE.MeshLambertMaterial({ map: createLiveryTexture(colors), ...see });
    const carbon = new THREE.MeshLambertMaterial({ color: '#1c1c1c', ...see });
    this.dryTyre = createCheckerTexture(8, '#1a1a1a', '#3a3a3a');
    const tyre = new THREE.MeshLambertMaterial({ map: this.dryTyre, ...see });
    this.sidewall = new THREE.MeshLambertMaterial({ map: this.dryTyre, ...see });

    // [width, height, length, x, y, z, material, visibility]
    // 'body' = hidden in first person, 'tip' = always shown, 'cockpit' = first person only.
    const parts: [number, number, number, number, number, number, THREE.Material, PartKind][] = [
      [0.9, 0.5, 3.0, 0, 0.45, 0.2, livery, 'body'], // monocoque
      [0.5, 0.3, 1.4, 0, 0.35, -2.1, livery, 'tip'], // nose
      [1.6, 0.4, 1.6, 0, 0.4, 0.3, livery, 'body'], // sidepods
      [0.5, 0.25, 0.8, 0, 0.8, -0.2, carbon, 'body'], // cockpit
      [0.4, 0.4, 1.2, 0, 0.85, 0.7, livery, 'body'], // engine cover
      [0.05, 0.5, 0.5, -0.7, 0.9, 1.9, carbon, 'body'], // rear wing endplates
      [0.05, 0.5, 0.5, 0.7, 0.9, 1.9, carbon, 'body'],
      [0.1, 0.4, 0.1, 0, 0.85, 1.75, carbon, 'body'], // rear wing post
      // Front tub, tapering towards the nose. Inside the monocoque, so only needed in first person.
      [1.65, 0.5, 1.0, 0, 0.45, 0.1, livery, 'cockpit'],
      [1.35, 0.4, 1.05, 0, 0.4, -0.925, livery, 'cockpit'],
    ];
    for (const [w, h, l, x, y, z, material, kind] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
      mesh.position.set(x, y, z);
      this.object.add(mesh);
      if (kind === 'body') this.body.push(mesh);
      if (kind === 'cockpit') {
        mesh.visible = false;
        this.cockpit.push(mesh);
      }
    }

    // A night race or the rain: the rear crash structure's red light and the two on the rear
    // wing's endplates (as on a real F1), lit through the fog. Built always, shown while lit.
    {
      const red = new THREE.MeshBasicMaterial({ color: '#ff2a1f', fog: false, ...see });
      const lights: [number, number, number, number, number, number, THREE.Material][] = [
        [0.3, 0.2, 0.4, 0, 0.5, 1.95, carbon], // crash structure
        [0.24, 0.12, 0.04, 0, 0.5, 2.17, red],
        [0.07, 0.14, 0.04, -0.7, 0.75, 2.17, red],
        [0.07, 0.14, 0.04, 0.7, 0.75, 2.17, red],
      ];
      // A soft glow round each light: twice its size, see-through, adding to what is behind.
      const glow = new THREE.MeshBasicMaterial({
        color: '#ff3b2e',
        fog: false,
        transparent: true,
        opacity: 0.35 * opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      for (const [w, h, l, x, y, z, material] of lights) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
        mesh.position.set(x, y, z);
        this.object.add(mesh);
        this.rearLights.push(mesh);
        if (material !== red) continue;
        const halo = new THREE.Mesh(new THREE.BoxGeometry(w * 2.2, h * 2.2, 0.01), glow);
        halo.position.set(x, y, z + 0.04);
        this.object.add(halo);
        this.rearLights.push(halo);
      }
    }

    // Front wing ('tip': seen in first person too): two halves hinged at the nose, so damage can
    // bend one down or break it off.
    const half = (side: -1 | 1): THREE.Group => {
      const hinge = new THREE.Group();
      hinge.position.set(0, FRONT_WING.y, FRONT_WING.z);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(FRONT_WING.halfSpan, 0.08, 0.4), carbon);
      mesh.position.x = (side * FRONT_WING.halfSpan) / 2;
      hinge.add(mesh);
      this.object.add(hinge);
      return hinge;
    };
    this.wingHalves = { left: half(-1), right: half(1) };
    // Rear wing's main plane (the endplates and post stay on): damage tilts it or breaks it off.
    this.rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5), carbon);
    this.rearWing.position.set(0, 1.1, 1.9);
    this.object.add(this.rearWing);

    // Same contact points the simulation samples surfaces at (local -Z is forward).
    for (const { ahead, side } of CAR_WHEELS) {
      const steers = ahead > 0;
      const width = steers ? 0.4 : 0.5;
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, width, 8),
        [tyre, this.sidewall, this.sidewall], // the cylinder's groups: tread, then both ends
      );
      // Default order XYZ: tipped onto X first (Z), then the spin (X) turns it round the axle.
      wheel.rotation.z = Math.PI / 2; // cylinder axis along X = the axle
      const pivot = new THREE.Group();
      pivot.position.set(side, WHEEL_RADIUS, -ahead);
      pivot.add(wheel);
      this.object.add(pivot);
      this.body.push(pivot);
      this.pivots.push(pivot);
      this.wheels.push(wheel);
      if (steers) this.frontPivots.push(pivot);
    }
    this.setRearLights(rearLights);
  }

  /** Wet-weather tyres (the rain): the blue band on every wheel's sidewalls, whatever the livery. */
  setWetTyres(on: boolean): void {
    this.wet = on;
    this.showSidewalls();
  }

  /** The sidewalls: the wets' blue in the rain, else the compound's band (none outside a GP). */
  private showSidewalls(): void {
    let map = this.dryTyre;
    if (this.wet) map = this.wetSidewall;
    else if (this.compound) {
      const compound = this.compound;
      if (!this.bandSidewalls.has(compound)) {
        this.bandSidewalls.set(compound, createBandSidewallTexture(TYRE_BANDS[compound]));
      }
      map = this.bandSidewalls.get(compound)!;
    }
    if (this.sidewall.map === map) return;
    this.sidewall.map = map;
    this.sidewall.needsUpdate = true;
  }

  /** The red rear lights on or off (a night race; the rain switches them live). */
  setRearLights(on: boolean): void {
    this.lightsOn = on;
    for (const part of this.rearLights) part.visible = on && !this.firstPerson;
  }

  /**
   * First person: the eye sits inside the body, so only the nose, front wing and a slim front tub
   * (linking them to the steering-wheel overlay) stay visible. They are real geometry in the world,
   * so they show the car's direction and how far away lines, kerbs, walls and other cars really are.
   */
  setFirstPerson(firstPerson: boolean): void {
    this.firstPerson = firstPerson;
    for (const part of this.body) part.visible = !firstPerson;
    for (const part of this.cockpit) part.visible = firstPerson;
    this.setRearLights(this.lightsOn);
    this.showDamage(this.damage);
  }

  /** Frees the GPU resources (geometries, materials, textures) when the car leaves the race. */
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
    this.dryTyre.dispose();
    this.wetSidewall.dispose();
  }

  update(pose: CarPose, frameSeconds: number): void {
    this.object.position.set(pose.x, pose.y ?? 0, pose.z);
    // Euler order YXZ: roll (local Z) first, then pitch (local X), then yaw: the car leans to the
    // outside of the slide and noses up a climb. With no pitch it is the same as yaw then roll.
    this.object.rotation.set(pose.pitch ?? 0, pose.heading, pose.slip * ROLL_PER_SLIP, 'YXZ');

    // Steering right (+) turns the wheels clockwise seen from above (negative Y rotation).
    for (const pivot of this.frontPivots) pivot.rotation.y = -pose.steer * MAX_WHEEL_STEER;
    const spin = (pose.forwardSpeed * frameSeconds) / WHEEL_RADIUS;
    for (const wheel of this.wheels) wheel.rotation.x -= spin;
    if (pose.damage !== this.damage) this.showDamage(pose.damage);
    if (pose.compound !== this.compound) {
      this.compound = pose.compound;
      this.showSidewalls();
    }
  }

  /**
   * Draws `damage` (see `damageLook`): front wing halves bent down or gone, the rear wing tilted or
   * gone, flat tyres squashed onto the road. Undefined = as new.
   */
  private showDamage(damage: CarDamage | undefined): void {
    this.damage = damage;
    const look = damage ? damageLook(damage) : null;
    const { left, right } = this.wingHalves;
    // The outer end down: +Z rotation lowers the left half (−X), −Z the right one.
    left.rotation.z = look?.frontWing.left.droop ?? 0;
    right.rotation.z = -(look?.frontWing.right.droop ?? 0);
    left.visible = !look?.frontWing.left.missing;
    right.visible = !look?.frontWing.right.missing;
    // Trailing edge (+Z, the rear) down.
    this.rearWing.rotation.x = look?.rearWing.tilt ?? 0;
    this.rearWing.visible = !this.firstPerson && !look?.rearWing.missing;
    this.pivots.forEach((pivot, i) => {
      const squash = 1 - FLAT_SQUASH * (look?.flat[i] ?? 0);
      pivot.scale.y = squash;
      pivot.position.y = WHEEL_RADIUS * squash;
    });
  }
}
