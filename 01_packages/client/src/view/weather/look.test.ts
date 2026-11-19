import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TrackTheme } from '../themes/theme';
import { dryLook, rainLook, weatherLook } from './look';

const theme = (sky: string, sun = 1.2): TrackTheme =>
  ({
    sky,
    fog: { near: 450, far: 2200 },
    light: { sky: '#fff8ec', ground: '#6d7a52', intensity: 2.4, sun },
  }) as unknown as TrackTheme;

const hsl = (color: string): THREE.HSL => new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 });

describe('rainLook', () => {
  const day = theme('#a9cce6');

  it('turns a blue sky into a grey one about as bright', () => {
    const rain = hsl(rainLook(day).sky);
    expect(rain.s).toBeLessThan(0.15);
    expect(rain.l).toBeLessThan(hsl(day.sky).l);
    expect(rain.l).toBeGreaterThan(hsl(day.sky).l * 0.6);
  });

  it('keeps a night sky dark', () => {
    expect(hsl(rainLook(theme('#0b1020')).sky).l).toBeLessThan(0.1);
  });

  it('brings the haze nearer and dims the light and the sun', () => {
    const rain = rainLook(day);
    expect(rain.fog.far).toBeLessThan(day.fog.far);
    expect(rain.fog.near).toBeLessThan(day.fog.near);
    expect(rain.light.intensity).toBeLessThan(day.light.intensity);
    expect(rain.light.sun).toBeLessThan(day.light.sun / 2);
  });

  it('darkens the road and the ground', () => {
    const rain = rainLook(day);
    expect(hsl(rain.road).l).toBeLessThan(0.6);
    expect(hsl(rain.ground).l).toBeLessThan(1);
  });
});

describe('weatherLook', () => {
  it('is the theme itself when dry', () => {
    const day = theme('#a9cce6');
    expect(weatherLook(day, 'dry')).toEqual(dryLook(day));
    expect(dryLook(day)).toMatchObject({ sky: day.sky, fog: day.fog, road: '#ffffff' });
    expect(weatherLook(day, 'rain')).toEqual(rainLook(day));
  });
});
