import { describe, expect, it } from 'vitest';
import { FLAG_PARAMS as P } from '../config/flags';
import { TICK_RATE } from '../config/sim';
import type { ImpactEvent } from '../sim/collision/types';
import type { GameState } from '../sim/game';
import { buildTrack } from '../track/buildTrack';
import { MONZA } from '../track/layouts';
import { locateOnLoop } from '../track/query';
import {
  crashSide,
  debrisLayout,
  sectorAt,
  stepYellowFlags,
  yellowSectors,
  type YellowFlag,
} from './flags';

const track = buildTrack(MONZA, { pitLane: true });

/** The state at `tick` with `carId` hitting a wall at `strength` where the lap is `progress` m on. */
const hit = (tick: number, carId: string, strength: number, progress: number): GameState => {
  const sample = track.samples.find((s) => s.distance >= progress)!;
  const impact: ImpactEvent = {
    carId,
    other: 'wall',
    point: sample.position,
    normal: { x: 0, z: 1 },
    strength,
  };
  return { tick, cars: [], impacts: [impact], laps: [] };
};
const quiet = (tick: number): GameState => ({ tick, cars: [], impacts: [], laps: [] });

describe('yellow flags and debris', () => {
  it('a hard wall hit: the flag in that sector and the debris, for 15 s', () => {
    const progress = track.sectorStarts[1]! + 100;
    const flags = stepYellowFlags([], hit(600, 'a', P.debrisImpact, progress), track, ['a']);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      carId: 'a',
      sector: 1,
      since: 600,
      until: 600 + 15 * TICK_RATE,
    });
    expect(flags[0]!.progress).toBeCloseTo(progress, -1);
    // Still out a tick before, gone at `until`.
    expect(stepYellowFlags(flags, quiet(600 + 15 * TICK_RATE - 1), track, ['a'])).toBe(flags);
    expect(stepYellowFlags(flags, quiet(600 + 15 * TICK_RATE), track, ['a'])).toEqual([]);
  });

  it('nothing for a light hit, a car hit, or a car not in the GP (the safety car)', () => {
    const none: readonly YellowFlag[] = [];
    expect(stepYellowFlags(none, hit(1, 'a', P.debrisImpact - 1, 500), track, ['a'])).toBe(none);
    expect(stepYellowFlags(none, hit(1, 'x', 40, 500), track, ['a'])).toBe(none);
    const wallHit = hit(1, 'a', 40, 500);
    const carHit = { ...wallHit, impacts: [{ ...wallHit.impacts[0]!, other: 'b' }] };
    expect(stepYellowFlags(none, carHit, track, ['a'])).toBe(none);
  });

  it('one crash is one flag (scraping along the wall); another car or later, another', () => {
    let flags = stepYellowFlags([], hit(100, 'a', 30, 500), track, ['a', 'b']);
    flags = stepYellowFlags(flags, hit(110, 'a', 30, 520), track, ['a', 'b']);
    expect(flags).toHaveLength(1);
    flags = stepYellowFlags(flags, hit(111, 'b', 30, 530), track, ['a', 'b']);
    flags = stepYellowFlags(flags, hit(100 + P.sameCrash * TICK_RATE, 'a', 30, 900), track, [
      'a',
      'b',
    ]);
    expect(flags).toHaveLength(3);
    expect(yellowSectors(flags)).toEqual([sectorAt(track, 500)]);
  });

  it('sectors by the track’s sector starts', () => {
    expect(sectorAt(track, 0)).toBe(0);
    expect(sectorAt(track, track.sectorStarts[2]!)).toBe(2);
    expect(sectorAt(track, track.length - 1)).toBe(2);
  });
});

const sample600 = track.samples[600]!;
const flag = (side: 1 | -1, since = 1234): YellowFlag => ({
  carId: 'p2',
  point: {
    x: sample600.position.x + sample600.normal.x * side * (sample600.halfWidth + 3),
    z: sample600.position.z + sample600.normal.z * side * (sample600.halfWidth + 3),
  },
  progress: sample600.distance,
  sector: 0,
  since,
  until: since + 900,
});

describe('debrisLayout', () => {
  it('the same pieces for the same crash (every player sees them alike), others for another', () => {
    expect(debrisLayout(track, flag(1))).toEqual(debrisLayout(track, flag(1)));
    expect(debrisLayout(track, flag(1, 99))).not.toEqual(debrisLayout(track, flag(1)));
  });

  it('on the asphalt, on the side of the wall hit, along the track from the hit', () => {
    for (const side of [1, -1] as const) {
      expect(crashSide(track, flag(side))).toBe(side);
      for (const piece of debrisLayout(track, flag(side))) {
        const at = locateOnLoop(track, { x: piece.x, z: piece.z });
        expect(Math.abs(at.lateral)).toBeLessThanOrEqual(at.halfWidth + 0.5);
        expect(Math.sign(at.lateral)).toBe(side);
        expect(at.distance - sample600.distance).toBeGreaterThan(-6);
        expect(at.distance - sample600.distance).toBeLessThan(40);
      }
    }
  });
});
