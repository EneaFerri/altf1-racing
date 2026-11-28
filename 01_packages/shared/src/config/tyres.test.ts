import { describe, expect, it } from 'vitest';
import { atWetness, TYRE_PARAMS as P, weatherCompound, type TyreCompound } from './tyres';

/** A compound's whole grip on a track `wetness` wet: its dry grip × its wet curve. */
const grip = (compound: TyreCompound, wetness: number): number =>
  P.grip[compound] * atWetness(P.wet[compound].grip, wetness);

describe('tyres in the wet (T.2)', () => {
  it('reads a curve at dry, half and soaked, linearly in between', () => {
    expect(atWetness([1, 0.5, 0.2], 0)).toBe(1);
    expect(atWetness([1, 0.5, 0.2], 0.25)).toBeCloseTo(0.75, 12);
    expect(atWetness([1, 0.5, 0.2], 0.5)).toBe(0.5);
    expect(atWetness([1, 0.5, 0.2], 1)).toBeCloseTo(0.2, 12);
  });

  it('makes each compound the best one in its own weather', () => {
    const best = (wetness: number): TyreCompound =>
      (['medium', 'intermediate', 'wet'] as const).reduce((a, b) =>
        grip(b, wetness) > grip(a, wetness) ? b : a,
      );
    expect(best(0)).toBe('medium');
    expect(best(0.3)).toBe('intermediate');
    expect(best(1)).toBe('wet');
  });

  it('keeps slicks off the road in the rain, rain tyres well above the old wet grip (0.3)', () => {
    expect(grip('medium', 1)).toBeLessThan(0.25);
    expect(grip('intermediate', 0.5)).toBeGreaterThan(0.75);
    expect(grip('wet', 1)).toBeGreaterThan(0.65);
    expect(grip('wet', 1)).toBeLessThan(P.grip.medium); // still harder than the dry
  });

  it('asks for mediums, intermediates, then full wets as the track gets wetter', () => {
    expect(weatherCompound(0)).toBe('medium');
    expect(weatherCompound(P.intermediateFrom)).toBe('intermediate');
    expect(weatherCompound(P.wetFrom - 0.01)).toBe('intermediate');
    expect(weatherCompound(P.wetFrom)).toBe('wet');
  });
});
