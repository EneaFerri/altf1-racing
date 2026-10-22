import * as THREE from 'three';
import { createWheelDisplayTexture } from './pixelTexture';

/** Distance of the cockpit plane in front of the eye (m); must stay beyond the camera's near plane. */
const DEPTH = 0.5;
/** Steering-wheel rotation at full lock (rad). Purely cosmetic. */
const MAX_WHEEL_ANGLE = Math.PI / 2;
/** Drawn after the world and without depth test, so walls and cars can never clip through it. */
const RENDER_ORDER = 1000;

/** Steering-wheel rotation for a smoothed steer value: right (+) turns it clockwise as seen by the driver. */
export function steeringWheelAngle(steer: number): number {
  return -steer * MAX_WHEEL_ANGLE;
}

/**
 * The bit of the car seen from the first-person camera: a small steering wheel at the bottom
 * centre and two thin cockpit sides in the bottom corners. Attached to the camera and laid out in
 * screen units (1 = half the screen height), so it covers the same small part of the view at any
 * window size or field of view and never hides the track ahead.
 */
export class CockpitView {
  readonly object = new THREE.Group();
  private readonly wheel = new THREE.Group();
  private readonly sides: THREE.Group[] = [];
  private order = RENDER_ORDER;

  constructor() {
    const carbon = flat('#1c1c1c');
    const rubber = flat('#2c2c2c');
    const livery = flat('#c8102e');

    // Wheel, in screen units: ~17% of the screen wide, its top at ~12% from the bottom edge.
    this.wheel.position.set(0, -0.9, 0);
    this.add(this.wheel, plate(0.62, 0.24, 0.06), carbon); // body with chamfered top corners
    this.add(this.wheel, rect(0.12, 0.3), rubber, -0.3, -0.04); // grips
    this.add(this.wheel, rect(0.12, 0.3), rubber, 0.3, -0.04);
    this.add(this.wheel, rect(0.18, 0.08), flat('#ffffff', createWheelDisplayTexture()), 0, 0.04);
    this.add(this.wheel, rect(0.03, 0.03), livery, -0.15, -0.05); // buttons
    this.add(this.wheel, rect(0.03, 0.03), flat('#f2c200'), 0.15, -0.05);

    // Cockpit sides: a dark wedge rising from each bottom corner with a thin livery edge.
    for (const side of [-1, 1]) {
      const wedge = new THREE.Group();
      this.add(wedge, triangle(0.2, 0.36), carbon);
      this.add(wedge, edgeStrip(0.2, 0.36, 0.025), livery);
      wedge.scale.x = side; // the shapes are drawn for the right corner
      this.object.add(wedge);
      this.sides.push(wedge);
    }
    this.object.add(this.wheel);
    this.object.visible = false;
  }

  /** Call every frame while visible: follows the steering and the camera's current frustum. */
  update(steer: number, camera: THREE.PerspectiveCamera): void {
    const halfHeight = DEPTH * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    this.object.position.set(0, 0, -DEPTH);
    this.object.scale.setScalar(halfHeight);
    for (const side of this.sides)
      side.position.set(Math.sign(side.scale.x) * camera.aspect, -1, 0);
    this.wheel.rotation.z = steeringWheelAngle(steer);
  }

  /** Adds a mesh to `parent`; later meshes draw on top of earlier ones (no depth test). */
  private add(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
  ): void {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    mesh.renderOrder = this.order++;
    mesh.frustumCulled = false;
    parent.add(mesh);
  }
}

function flat(color: string, map?: THREE.Texture): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color,
    map,
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide, // the corner wedges are mirrored with a negative scale
  });
}

function rect(width: number, height: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(width, height);
}

/** Rectangle centred on the origin with its two top corners cut by `chamfer`. */
function plate(width: number, height: number, chamfer: number): THREE.BufferGeometry {
  const w = width / 2;
  const h = height / 2;
  const shape = new THREE.Shape()
    .moveTo(-w, -h)
    .lineTo(w, -h)
    .lineTo(w, h - chamfer)
    .lineTo(w - chamfer, h)
    .lineTo(-w + chamfer, h)
    .lineTo(-w, h - chamfer)
    .closePath();
  return new THREE.ShapeGeometry(shape);
}

/** Right-corner wedge: `width` along the bottom edge (inwards), `height` up the side edge. */
function triangle(width: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape().moveTo(0, 0).lineTo(-width, 0).lineTo(0, height).closePath();
  return new THREE.ShapeGeometry(shape);
}

/** Thin strip along the wedge's slanted edge. */
function edgeStrip(width: number, height: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
    .moveTo(-width, 0)
    .lineTo(-width + thickness * 2, 0)
    .lineTo(0, height - thickness * 2)
    .lineTo(0, height)
    .closePath();
  return new THREE.ShapeGeometry(shape);
}
