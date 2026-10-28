import type { Area } from '../scenery/placement';

/** A point on the minimap canvas (px, origin top-left). */
export interface MapPoint {
  readonly u: number;
  readonly v: number;
}

/**
 * World ground → a `size`×`size` canvas, `padding` px clear on every side: one scale for both axes
 * (the shape stays true), centred. Seen from above with −z up, so +x is right: not mirrored.
 */
export function fitToCanvas(
  bounds: Area,
  size: number,
  padding: number,
): (x: number, z: number) => MapPoint {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const scale = (size - 2 * padding) / Math.max(width, depth, 1e-6);
  const offsetU = (size - width * scale) / 2;
  const offsetV = (size - depth * scale) / 2;
  return (x, z) => ({
    u: offsetU + (x - bounds.minX) * scale,
    v: offsetV + (z - bounds.minZ) * scale,
  });
}
