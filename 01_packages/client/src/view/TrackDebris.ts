import * as THREE from 'three';
import { crashSide, debrisLayout, type Track, type YellowFlag } from '@altf1/shared';
import { FlagMarshal } from './FlagMarshal';
import { YELLOW_MARSHAL_COLORS } from './flagMarshalArt';

/** The yellow flag's marshal stands this far before the crash (m): the drivers' warning. */
const MARSHAL_BEFORE = 120;

/** One crash drawn: its debris and its marshal. */
interface Crash {
  readonly debris: THREE.Group;
  readonly marshal: FlagMarshal;
}

/**
 * Crashes' debris on the track and their yellow flags (R.2): for each `YellowFlag` out, its pieces
 * of carbon and paint (`debrisLayout`, the crashed car's colour) and a marshal waving the yellow
 * flag before it, on the other side of the road; both gone with the flag. Reads state only.
 */
export class TrackDebris {
  readonly object = new THREE.Group();
  private readonly crashes = new Map<string, Crash>();
  private readonly carbon = new THREE.MeshLambertMaterial({ color: '#17171b' });
  private readonly white = new THREE.MeshLambertMaterial({ color: '#e8e8ec' });
  private readonly paints = new Map<string, THREE.MeshLambertMaterial>();

  private readonly track: Track;

  constructor(track: Track) {
    this.track = track;
  }

  /** The flags out now; `colorOf`: a crashed car's paint. */
  show(flags: readonly YellowFlag[], colorOf: (carId: string) => string): void {
    const keys = new Set(flags.map(keyOf));
    for (const [key, crash] of this.crashes) {
      if (keys.has(key)) continue;
      this.object.remove(crash.debris, crash.marshal.object);
      crash.debris.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
      crash.marshal.dispose();
      this.crashes.delete(key);
    }
    for (const flag of flags) {
      const key = keyOf(flag);
      if (this.crashes.has(key)) continue;
      const debris = new THREE.Group();
      for (const piece of debrisLayout(this.track, flag)) {
        const material =
          piece.kind === 'carbon'
            ? this.carbon
            : piece.kind === 'white'
              ? this.white
              : this.paint(colorOf(flag.carId));
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(piece.width, piece.height, piece.length),
          material,
        );
        mesh.position.set(piece.x, piece.y + piece.height / 2 + 0.01, piece.z);
        mesh.rotation.y = piece.yaw;
        debris.add(mesh);
      }
      const marshal = new FlagMarshal(this.track, {
        progress: flag.progress - MARSHAL_BEFORE,
        side: crashSide(this.track, flag) === 1 ? -1 : 1,
        colors: YELLOW_MARSHAL_COLORS,
      });
      marshal.visible = true;
      this.object.add(debris, marshal.object);
      this.crashes.set(key, { debris, marshal });
    }
  }

  /** Waves the yellow flags (once per frame). */
  update(frameSeconds: number): void {
    for (const crash of this.crashes.values()) crash.marshal.update(frameSeconds);
  }

  private paint(color: string): THREE.MeshLambertMaterial {
    let material = this.paints.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color });
      this.paints.set(color, material);
    }
    return material;
  }
}

function keyOf(flag: YellowFlag): string {
  return `${flag.carId}@${flag.since}`;
}
