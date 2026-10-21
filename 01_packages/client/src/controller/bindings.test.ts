import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '@altf1/shared';
import { inputFromKeys } from './bindings';

describe('inputFromKeys', () => {
  it('returns neutral input when nothing is held', () => {
    expect(inputFromKeys(new Set())).toEqual(NEUTRAL_INPUT);
  });

  it('maps WASD and Space', () => {
    expect(inputFromKeys(new Set(['KeyW', 'KeyD', 'Space']))).toEqual({
      throttle: 1,
      brake: 0,
      steer: 1,
      handbrake: true,
      reset: false,
    });
    expect(inputFromKeys(new Set(['KeyS', 'KeyA'])).steer).toBe(-1);
  });

  it('passes tick triggers through', () => {
    expect(inputFromKeys(new Set(), new Set(['reset'])).reset).toBe(true);
  });

  it('cancels out opposite steering keys', () => {
    expect(inputFromKeys(new Set(['KeyA', 'KeyD'])).steer).toBe(0);
  });
});
