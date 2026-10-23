import type { Vec2 } from './vec2';

/**
 * Uniform grid over a set of 2D segments, for fast "which segments are near this circle" queries.
 * Used for the track centreline (surface lookup) and the walls (collisions).
 */
export class SegmentGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly cellSize: number;

  constructor(segments: readonly (readonly [Vec2, Vec2])[], cellSize = 10) {
    this.cellSize = cellSize;
    segments.forEach(([a, b], index) => {
      this.forEachCell(
        Math.min(a.x, b.x),
        Math.min(a.z, b.z),
        Math.max(a.x, b.x),
        Math.max(a.z, b.z),
        (key) => {
          const cell = this.cells.get(key);
          if (cell) cell.push(index);
          else this.cells.set(key, [index]);
        },
      );
    });
  }

  /** Indices of segments whose cells overlap the circle's bounding box, unique and ascending (deterministic). */
  query(center: Vec2, radius: number): number[] {
    const found = new Set<number>();
    this.forEachCell(
      center.x - radius,
      center.z - radius,
      center.x + radius,
      center.z + radius,
      (key) => this.cells.get(key)?.forEach((index) => found.add(index)),
    );
    return [...found].sort((a, b) => a - b);
  }

  private forEachCell(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    visit: (key: number) => void,
  ): void {
    const x0 = Math.floor(minX / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const z0 = Math.floor(minZ / this.cellSize);
    const z1 = Math.floor(maxZ / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) visit(cellKey(cx, cz));
    }
  }
}

/** Packs two cell coordinates (±32k cells) into one number key. */
function cellKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}
