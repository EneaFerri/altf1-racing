import { describe, expect, it } from 'vitest';
import { NO_DAMAGE } from '@altf1/shared';
import { damageLook } from './carDamageLook';

describe('damageLook', () => {
  it('draws an undamaged car as new', () => {
    const look = damageLook(NO_DAMAGE);
    expect(look.frontWing.left).toEqual({ droop: 0, missing: false });
    expect(look.frontWing.right).toEqual({ droop: 0, missing: false });
    expect(look.rearWing).toEqual({ tilt: 0, missing: false });
    expect(look.flat).toEqual([0, 0, 0, 0]);
  });

  it('bends the front wing most on the side that was hit, then breaks that half off', () => {
    const bent = damageLook({ ...NO_DAMAGE, frontWing: 0.4, tyres: [0, 0.2, 0, 0] });
    expect(bent.frontWing.right.droop).toBeGreaterThan(bent.frontWing.left.droop);
    expect(bent.frontWing.right.missing).toBe(false);
    const broken = damageLook({ ...NO_DAMAGE, frontWing: 0.85, tyres: [0, 0.4, 0, 0] });
    expect(broken.frontWing.right.missing).toBe(true);
    expect(broken.frontWing.left.missing).toBe(false);
    const gone = damageLook({ ...NO_DAMAGE, frontWing: 1 });
    expect([gone.frontWing.left.missing, gone.frontWing.right.missing]).toEqual([true, true]);
  });

  it('tilts the rear wing, then breaks it off', () => {
    expect(damageLook({ ...NO_DAMAGE, rearWing: 0.5 }).rearWing).toEqual({
      tilt: 0.25,
      missing: false,
    });
    expect(damageLook({ ...NO_DAMAGE, rearWing: 0.8 }).rearWing.missing).toBe(true);
  });

  it('keeps tyres round up to half damage, then flattens them', () => {
    expect(damageLook({ ...NO_DAMAGE, tyres: [0.5, 0.75, 1, 0.2] }).flat).toEqual([0, 0.5, 1, 0]);
  });
});
