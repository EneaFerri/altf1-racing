import * as THREE from 'three';

/** How the falling rain looks (live in F2 → Weather, but `count`, read once). */
export interface RaindropParams {
  /** Drops in the box round the camera. */
  count: number;
  /** The box's width and depth (m), centred on the camera. */
  width: number;
  /** The box's height (m), from `below` under the camera up. */
  height: number;
  below: number;
  /** Falling speed (m/s). */
  speed: number;
  /** Sideways drift per metre of fall (x, z): the rain's slant. */
  windX: number;
  windZ: number;
  /** A streak's length (m). */
  length: number;
  /** Opacity of a drop in full view. */
  opacity: number;
  /** No drop nearer the eye than this (m), then fading in over `fadeIn` m: none in the face. */
  nearClear: number;
  fadeIn: number;
}

/** The owner's values (F2, 2026-11-18): clearly raining, the view stays clear. See 01_docs/weather.md. */
export const RAINDROP_PARAMS: RaindropParams = {
  count: 1500,
  width: 60,
  height: 30,
  below: 6,
  speed: 22,
  windX: 0.3,
  windZ: 0.1,
  length: 2,
  opacity: 0.8,
  nearClear: 3,
  fadeIn: 5,
};

/** Light grey streaks. */
const COLOR = '#dfe4ea';
/** The shader's clock restarts every this many seconds. */
const TIME_PERIOD = 600;
/** Seed of the drops' places, so the rain looks the same on every load. */
const SEED = 97;

type Vec3 = { readonly x: number; readonly y: number; readonly z: number };

/**
 * Where a drop starting at `base` (in the box's own frame, 0..size) is after `time` s, wrapped
 * into the box round `camera`: the formula the vertex shader runs (kept here to test it).
 */
export function dropPosition(base: Vec3, time: number, camera: Vec3, p: RaindropParams): Vec3 {
  const fall = p.speed * time;
  const origin = { x: camera.x - p.width / 2, y: camera.y - p.below, z: camera.z - p.width / 2 };
  const wrap = (value: number, start: number, size: number): number =>
    start + ((((value - start) % size) + size) % size);
  return {
    x: wrap(base.x + p.windX * fall, origin.x, p.width),
    y: wrap(base.y - fall, origin.y, p.height),
    z: wrap(base.z + p.windZ * fall, origin.z, p.width),
  };
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform vec3 uCamera;
uniform vec3 uBox;
uniform float uBelow;
uniform float uSpeed;
uniform vec2 uWind;
uniform float uLength;
attribute float aEnd;
varying float vEye;
varying float vAcross;
void main() {
  float fall = uSpeed * uTime;
  vec3 origin = vec3(uCamera.x - uBox.x * 0.5, uCamera.y - uBelow, uCamera.z - uBox.z * 0.5);
  vec3 moved = position + vec3(uWind.x * fall, -fall, uWind.y * fall);
  vec3 p = origin + mod(moved - origin, uBox);
  // The streak's tail trails up and back along the fall.
  p += normalize(vec3(-uWind.x, 1.0, -uWind.y)) * uLength * aEnd;
  vec4 eye = modelViewMatrix * vec4(p, 1.0);
  vEye = length(eye.xyz);
  vAcross = length(p.xz - uCamera.xz) / (uBox.x * 0.5);
  gl_Position = projectionMatrix * eye;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uNear;
uniform float uFadeIn;
varying float vEye;
varying float vAcross;
void main() {
  // None in the face; fading out towards the box's sides, so no drop pops in or out.
  float alpha = uOpacity * smoothstep(uNear, uNear + uFadeIn, vEye) * (1.0 - smoothstep(0.6, 0.95, vAcross));
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
`;

/**
 * Falling rain: short grey streaks in a box that follows the camera. One draw call; the drops move
 * and wrap round the camera in the vertex shader, so nothing is updated per drop on the CPU.
 * Light by design: the view stays clear (01_docs/weather.md).
 */
export class Raindrops {
  readonly object: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;

  constructor(private readonly params: RaindropParams) {
    const random = seededRandom(SEED);
    const base: number[] = [];
    const end: number[] = [];
    for (let i = 0; i < params.count; i++) {
      const x = random() * params.width;
      const y = random() * params.height;
      const z = random() * params.width;
      base.push(x, y, z, x, y, z);
      end.push(0, 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
    geometry.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCamera: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3() },
        uBelow: { value: 0 },
        uSpeed: { value: 0 },
        uWind: { value: new THREE.Vector2() },
        uLength: { value: 0 },
        uColor: { value: new THREE.Color(COLOR) },
        uOpacity: { value: 0 },
        uNear: { value: 0 },
        uFadeIn: { value: 0 },
      },
    });
    this.object = new THREE.LineSegments(geometry, this.material);
    this.object.frustumCulled = false; // it is always round the camera
  }

  /** Call every frame it is shown: the drops fall on round `camera`. */
  update(camera: THREE.Camera, frameSeconds: number): void {
    const p = this.params;
    // Kept small for the GPU's float precision; the pattern shifts once a period, unseen.
    this.time = (this.time + frameSeconds) % TIME_PERIOD;
    const u = this.material.uniforms;
    u.uTime!.value = this.time;
    (u.uCamera!.value as THREE.Vector3).copy(camera.getWorldPosition(new THREE.Vector3()));
    (u.uBox!.value as THREE.Vector3).set(p.width, p.height, p.width);
    u.uBelow!.value = p.below;
    u.uSpeed!.value = p.speed;
    (u.uWind!.value as THREE.Vector2).set(p.windX, p.windZ);
    u.uLength!.value = p.length;
    u.uOpacity!.value = p.opacity;
    u.uNear!.value = p.nearClear;
    u.uFadeIn!.value = p.fadeIn;
  }
}

/** Park-Miller, as in pixelTexture: the same drops on every load. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}
