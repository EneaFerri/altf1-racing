import { createAsphaltTexture, createGroundTexture } from '../pixelTexture';
import type { TrackTheme } from './theme';

/** The original look (Test Ring): blue sky, short fog, red/white kerbs, tyre walls, no props. */
export const CLASSIC_THEME: TrackTheme = {
  sky: '#87ceeb',
  // Fog hides the ground's edge and gives depth.
  fog: { near: 60, far: 250 },
  viewDistance: 300,
  light: { sky: '#ffffff', ground: '#444444', intensity: 2.5, sun: 0 },
  ground: { texture: createGroundTexture, tile: 2, margin: 300 },
  asphalt: createAsphaltTexture,
  kerb: { colors: ['#e10600', '#f4f4f4'], block: 1 },
  edgeLineInset: 0,
  wallStyle: () => () => 'tyres',
  scenery: () => [],
};
