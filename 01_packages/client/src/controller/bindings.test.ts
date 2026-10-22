import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '@altf1/shared';
import { ACTION_KEYS, DRIVE_KEYS, inputFromKeys, TICK_TRIGGER_KEYS } from './bindings';

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

  it('brakes with C as well as S', () => {
    expect(inputFromKeys(new Set(['KeyC'])).brake).toBe(1);
  });

  it('passes tick triggers through', () => {
    expect(inputFromKeys(new Set(), new Set(['reset'])).reset).toBe(true);
  });

  it('cancels out opposite steering keys', () => {
    expect(inputFromKeys(new Set(['KeyA', 'KeyD'])).steer).toBe(0);
  });
});

describe('key maps', () => {
  it('toggles the camera with V', () => {
    expect(ACTION_KEYS.toggleCamera).toEqual(['KeyV']);
  });

  it('never binds one key to two things', () => {
    const all = [DRIVE_KEYS, TICK_TRIGGER_KEYS, ACTION_KEYS].flatMap((map) =>
      Object.values(map).flat(),
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
