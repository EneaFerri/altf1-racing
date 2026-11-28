import * as THREE from 'three';
import { locateOnTrack, type Track } from '@altf1/shared';
import { paintPixels } from './hud/pixelFigure';
import { MARSHAL_COLORS, MARSHAL_FRAMES, MARSHAL_HEIGHT, MARSHAL_WIDTH } from './flagMarshalArt';

/** She stands this tall, flag included (m): a touch over life size, to be seen at speed. */
const HEIGHT = 2.4;
/** On a podium this high and wide (m), as the F1 flag is waved from a raised stand. */
const PODIUM = { height: 1.2, size: 1.6 } as const;
/** The flag swaps frames this often (s). */
const WAVE = 0.22;
/** Beyond the asphalt's edge (m), at most half the run-off. */
const BESIDE = 2.5;

/** Where a flag marshal stands and what she waves (left out: the chequered flag at the line). */
export interface FlagMarshalSpot {
  /** Main-loop progress (m from the line). */
  readonly progress: number;
  /** The side of the track: 1 right of the driving direction, −1 left. */
  readonly side: 1 | -1;
  /** The figure's and flag's colours (`YELLOW_MARSHAL_COLORS`). */
  readonly colors: Readonly<Record<string, string>>;
}

/**
 * A flag marshal: by default waving the chequered flag at the finish line (Grand Prix, from the
 * first driver on the last lap), on the run-off of the side away from the pit lane; or, at
 * `spot`, a track marshal with the yellow flag before a crash (R.2). A pixel-art sprite always
 * facing the camera, on a small podium.
 */
export class FlagMarshal {
  readonly object = new THREE.Group();
  private readonly sprite: THREE.Sprite;
  private readonly frames: THREE.Texture[];
  private time = 0;

  constructor(track: Track, spot?: FlagMarshalSpot) {
    this.frames = MARSHAL_FRAMES.map((rows) => {
      const texture = new THREE.CanvasTexture(paintPixels(rows, spot?.colors ?? MARSHAL_COLORS));
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    });
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.frames[0]!, transparent: true, alphaTest: 0.5 }),
    );
    this.sprite.scale.set((HEIGHT * MARSHAL_WIDTH) / MARSHAL_HEIGHT, HEIGHT, 1);
    this.sprite.position.y = PODIUM.height + HEIGHT / 2;
    // Red sides, white top and bottom (a box's faces: ±x, ±y, ±z).
    const red = new THREE.MeshLambertMaterial({ color: '#e10600' });
    const white = new THREE.MeshLambertMaterial({ color: '#f4f4f6' });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(PODIUM.size, PODIUM.height, PODIUM.size), [
      red,
      red,
      white,
      white,
      red,
      red,
    ]);
    podium.position.y = PODIUM.height / 2;
    this.object.add(podium, this.sprite);
    // At the line, on the side away from the pit lane (its route's garages are on that side).
    const n = track.samples.length;
    const at = spot ? Math.round((spot.progress / track.length) * n) : 0;
    const line = track.samples[((at % n) + n) % n]!;
    const pitSide = track.routes.find((road) => road.pit)?.pitRules?.garageSide ?? 1;
    const side = spot?.side ?? -pitSide;
    const offset = side * (line.halfWidth + Math.min(BESIDE, track.runoffWidth / 2));
    const x = line.position.x + line.normal.x * offset;
    const z = line.position.z + line.normal.z * offset;
    const ground = locateOnTrack(track, { x, z }).height;
    this.object.position.set(x, ground, z);
    this.object.visible = false;
  }

  set visible(on: boolean) {
    this.object.visible = on;
  }

  /** Frees its GPU resources (a yellow flag's marshal goes when the flag does). */
  dispose(): void {
    for (const frame of this.frames) frame.dispose();
    this.object.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        for (const m of [node.material].flat() as THREE.Material[]) m.dispose();
      }
    });
    this.sprite.material.dispose();
  }

  /** Waves the flag (once per frame). */
  update(frameSeconds: number): void {
    if (!this.object.visible) return;
    this.time += frameSeconds;
    const frame = Math.floor(this.time / WAVE) % this.frames.length;
    this.sprite.material.map = this.frames[frame]!;
  }
}
