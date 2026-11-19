import * as THREE from 'three';
import type { Weather } from '@altf1/shared';
import type { TrackTheme } from '../themes/theme';

/** What the weather changes in a track's look; the rest of its theme stays as it is. */
export interface WeatherLook {
  readonly sky: string;
  readonly fog: { readonly near: number; readonly far: number };
  readonly light: {
    readonly sky: string;
    readonly ground: string;
    readonly intensity: number;
    readonly sun: number;
  };
  /** Multiplies the road's colours (asphalt, kerbs, lines): darker when wet. */
  readonly road: string;
  /** Multiplies the ground's colours (grass, run-off, gravel). */
  readonly ground: string;
}

/** The rain's haze: much nearer than any dry theme's, never further. */
const RAIN_FOG = { near: 40, far: 900 } as const;
/** Grey the rain's light turns towards, and how far. */
const RAIN_LIGHT_GREY = '#c4c9d0';
const RAIN_LIGHT_GREYING = 0.7;
/** The rain's light and sun, as a share of the dry ones. */
const RAIN_LIGHT = 0.72;
const RAIN_SUN = 0.25;
/** Wet asphalt and kerbs: darker and a little cooler. */
const WET_ROAD = '#7c828c';
/** Wet grass and gravel: a little darker. */
const WET_GROUND = '#b2b9b2';
/** The overcast sky's brightness, as a share of the dry sky's; its slight blue cast. */
const OVERCAST = { brightness: 0.82, tint: [0.97, 1, 1.05] } as const;

/** The theme's own look: dry. */
export function dryLook(theme: TrackTheme): WeatherLook {
  return {
    sky: theme.sky,
    fog: theme.fog,
    light: theme.light,
    road: '#ffffff',
    ground: '#ffffff',
  };
}

/**
 * The theme's look in the rain, for any track: an overcast sky (grey, about as bright as the
 * theme's own: a night race stays dark), a haze much nearer than the dry fog, dimmer and greyer
 * light with hardly any sun, a darker wet road and ground. See 01_docs/weather.md.
 */
export function rainLook(theme: TrackTheme): WeatherLook {
  const dry = new THREE.Color(theme.sky);
  const level = (0.2126 * dry.r + 0.7152 * dry.g + 0.0722 * dry.b) * OVERCAST.brightness;
  const [r, g, b] = OVERCAST.tint.map((t) => Math.min(1, level * t)) as [number, number, number];
  const grey = (color: string): string =>
    `#${new THREE.Color(color).lerp(new THREE.Color(RAIN_LIGHT_GREY), RAIN_LIGHT_GREYING).getHexString()}`;
  return {
    sky: `#${new THREE.Color(r, g, b).getHexString()}`,
    fog: {
      near: Math.min(theme.fog.near, RAIN_FOG.near),
      far: Math.min(theme.fog.far, RAIN_FOG.far),
    },
    light: {
      sky: grey(theme.light.sky),
      ground: grey(theme.light.ground),
      intensity: theme.light.intensity * RAIN_LIGHT,
      sun: theme.light.sun * RAIN_SUN,
    },
    road: WET_ROAD,
    ground: WET_GROUND,
  };
}

/** The look of `theme` in `weather`. */
export function weatherLook(theme: TrackTheme, weather: Weather): WeatherLook {
  return weather === 'rain' ? rainLook(theme) : dryLook(theme);
}
