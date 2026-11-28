import type * as THREE from 'three';
import type { Track, Vec2 } from '@altf1/shared';

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
    /**
     * Elevated ground only: tinted `color` from `from` to `to` m up and above (Monaco: the green
     * slopes above the town).
     */
    readonly highland?: { readonly from: number; readonly to: number; readonly color: string };
    /** Multiplies the ground's texture (a night race: darker away from the floodlights). */
    readonly tint?: string;
  };
  readonly asphalt: () => THREE.Texture;
  /** Low-kerb colours and the length of one colour block (m). */
  readonly kerb: { readonly colors: readonly [string, string]; readonly block: number };
  /** The white edge line sits this far inside the asphalt edge (m). */
  readonly edgeLineInset: number;
  /** The cars' red rear lights lit (a night race). */
  readonly carLights?: boolean;
  /** Paint the starting grid's boxes (real circuits; the frozen test maps have none). */
  readonly gridBoxes?: boolean;
  /** Style of wall segment `index` (`track.walls`: the left side's segments, then the right's). */
  readonly wallStyle: (track: Track) => (index: number) => WallStyle;
  /**
   * Props around the circuit (grandstands, trees, ...), built once per track, standing on `ground`
   * (the ground's height as drawn: 0 everywhere on a flat track).
   */
  readonly scenery: (track: Track, ground: (p: Vec2) => number) => THREE.Object3D[];
  /**
   * The ground's height around an elevated track (Monaco: the real land); left out: the road's
   * heights around it. Settled under the road by SceneView.
   */
  readonly groundHeight?: (track: Track) => (p: Vec2) => number;
  /**
   * The ground is settled under the routes too (the Grand Prix's pit lane), not only the main loop:
   * São Paulo's land rose through its lane (owner, 2026-11-18). Left out on the other circuits,
   * whose ground stays as it was (rule 5).
   */
  readonly groundUnderRoutes?: boolean;
}

/**
 * Each track's own theme, loaded only when that track is chosen: the real circuits' scenery
 * (generated from OSM) is most of the client's code, so each one is its own chunk.
 */
const THEMES: Readonly<Record<string, () => Promise<TrackTheme>>> = {
  Monza: async () => (await import('./monza')).MONZA_THEME,
  Barcelona: async () => (await import('./barcelona')).BARCELONA_THEME,
  Monaco: async () => (await import('./monaco')).MONACO_THEME,
  'Mexico City': async () => (await import('./mexico')).MEXICO_THEME,
  Singapore: async () => (await import('./singapore')).SINGAPORE_THEME,
  'Las Vegas': async () => (await import('./lasVegas')).LAS_VEGAS_THEME,
  'São Paulo': async () => (await import('./saoPaulo')).SAO_PAULO_THEME,
  Baku: async () => (await import('./baku')).BAKU_THEME,
};

/** Loads the theme drawn for a circuit (every one of `GP_TRACKS` has its own). */
export async function loadTheme(trackName: string): Promise<TrackTheme> {
  const own = THEMES[trackName];
  if (!own) throw new Error(`No theme for track "${trackName}"`);
  return own();
}
