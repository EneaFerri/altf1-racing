import * as THREE from 'three';

/** Height of the tag's centre above the ground (m): just over the car's rear wing. */
const HEIGHT = 2.4;
/** Tag size close up (m). */
const WIDTH = 3.2;
const ASPECT = 4; // canvas 256 × 64
/** Beyond this distance (m) the tag keeps its on-screen size instead of shrinking further. */
const READABLE_DISTANCE = 35;

/**
 * An opponent's nickname floating above its car (multiplayer): white bold text on a translucent
 * dark pill, crisp pixels. Depth-tested, so walls and hills hide it like they hide the car.
 */
export class NameTag {
  readonly object: THREE.Sprite;
  private readonly texture: THREE.CanvasTexture;

  constructor(name: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256 / ASPECT;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '800 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const textWidth = Math.min(canvas.width - 8, ctx.measureText(name).width + 28);
    ctx.fillStyle = 'rgba(12, 12, 16, 0.72)';
    ctx.beginPath();
    ctx.roundRect((canvas.width - textWidth) / 2, 8, textWidth, canvas.height - 16, 10);
    ctx.fill();
    ctx.fillStyle = '#f4f4f6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 1, canvas.width - 24);

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.object = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, fog: false }),
    );
    this.object.scale.set(WIDTH, WIDTH / ASPECT, 1);
  }

  /** Puts the tag over the car at (x, z), seen from `camera`. */
  update(x: number, z: number, camera: THREE.Camera): void {
    this.object.position.set(x, HEIGHT, z);
    const grow = Math.max(1, this.object.position.distanceTo(camera.position) / READABLE_DISTANCE);
    this.object.scale.set(WIDTH * grow, (WIDTH / ASPECT) * grow, 1);
  }

  dispose(): void {
    this.texture.dispose();
    this.object.material.dispose();
  }
}
