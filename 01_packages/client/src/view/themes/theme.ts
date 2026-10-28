import type * as THREE from 'three';
import type { Track } from '@altf1/shared';
import { BARCELONA_THEME } from './barcelona';
import { CLASSIC_THEME } from './classic';
import { KRUNCAR_THEME } from './kruncar';
import { MONACO_THEME } from './monaco';
import { MONZA_THEME } from './monza';

/** How a stretch of wall is drawn (the physics wall is the same everywhere). */
export type WallStyle = 'tyres' | 'fence' | 'concrete' | 'armco' | 'armcoFence';

/**
 * Everything that makes a track look the way it does: sky, light, ground, asphalt, kerbs, walls
 * and its scenery. View only: the simulation never sees it. See 01_docs/themes.md.
 */
export interface TrackTheme {
  readonly sky: string;
  readonly fog: { readonly near: number; readonly far: number };
  /** Camera far plane (m): how far the scenery (e.g. mountains) stays visible. */
  readonly viewDistance: number;
  readonly light: {
    readonly sky: string;
    readonly ground: string;
    readonly intensity: number;
    /** Directional "sun" intensity (0 = none); flat-shaded props need it to show their facets. */
    readonly sun: number;
  };
  /** Grass ground: texture and metres per repeat; it extends `groundMargin` m past the track. */
  readonly ground: {
    readonly texture: () => THREE.Texture;
    readonly tile: number;
    readonly margin: number;
  };
  readonly asphalt: () => THREE.Texture;
  /** Low-kerb colours and the length of one colour block (m). */
  readonly kerb: { readonly colors: readonly [string, string]; readonly block: number };
  /** The white edge line sits this far inside the asphalt edge (m): on Kruncar, inside the kerb. */
  readonly edgeLineInset: number;
  /** Paint the starting grid's boxes (real circuits; the frozen test maps have none). */
  readonly gridBoxes?: boolean;
  /** Style of wall segment `index` (`track.walls`: the left side's segments, then the right's). */
  readonly wallStyle: (track: Track) => (index: number) => WallStyle;
  /** Props around the circuit (grandstands, trees, ...), built once per track. */
  readonly scenery: (track: Track) => THREE.Object3D[];
}

const THEMES: Readonly<Record<string, TrackTheme>> = {
  Kruncar: KRUNCAR_THEME,
  Monza: MONZA_THEME,
  Barcelona: BARCELONA_THEME,
  Monaco: MONACO_THEME,
};

/** The theme drawn for a track: its own when it has one, else the classic look. */
export function themeFor(trackName: string): TrackTheme {
  return THEMES[trackName] ?? CLASSIC_THEME;
}
