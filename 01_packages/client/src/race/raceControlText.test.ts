import { describe, expect, it } from 'vitest';
import { TICK_RATE, type GrandPrixInfo, type SafetyCarInfo } from '@altf1/shared';
import {
  deltaText,
  NO_RACE_CONTROL,
  penaltyNotice,
  raceControl,
  wentGreen,
  yellowFlagText,
} from './raceControlText';

const info = (more: Partial<GrandPrixInfo>): GrandPrixInfo => ({
  phase: 'race',
  manager: 'p1',
  drivers: ['p1', 'p2'],
  qualifying: [],
  race: [],
  raceLaps: 12,
  hold: null,
  boxes: {},
  weather: 'dry',
  forecast: [{ tick: 0, wetness: 0 }],
  sectorBests: [null, null, null],
  ...more,
});
const sc = (more: Partial<SafetyCarInfo>): SafetyCarInfo => ({
  phase: 'out',
  since: 0,
  inThisLap: false,
  released: [],
  ...more,
});
const names = (id: string): string => ({ p1: 'Enea', p2: 'Kimi' })[id] ?? id;

describe('raceControl', () => {
  it('hidden without a safety car or outside the race', () => {
    expect(raceControl(info({}), 'p1', null, 0, names)).toBe(NO_RACE_CONTROL);
    expect(raceControl(info({ phase: 'results', safetyCar: sc({}) }), 'p1', 1, 0, names)).toBe(
      NO_RACE_CONTROL,
    );
  });

  it('called, waiting for the leader: the title, no overtaking, the delta', () => {
    const waiting = info({ safetyCar: sc({ phase: 'deployed' }) });
    expect(raceControl(waiting, 'p1', 1.24, 0, names)).toEqual({
      flag: null,
      title: 'SAFETY CAR',
      rule: 'NO OVERTAKING · KEEP ABOVE YOUR DELTA',
      delta: { text: 'DELTA +1.2', ok: true },
      deltaWarning: null,
      giveBack: null,
    });
    const beating = raceControl(waiting, 'p1', -0.6, 0, names, 3.2);
    expect(beating.delta).toEqual({ text: 'DELTA −0.6', ok: false });
    expect(beating.deltaWarning).toBe('BACK ABOVE YOUR DELTA · 4 s');
  });

  it('out with the leader: no delta, catch up the queue', () => {
    const out = raceControl(info({ safetyCar: sc({}) }), 'p1', -0.4, 0, names, 2);
    expect(out).toMatchObject({
      title: 'SAFETY CAR',
      rule: 'NO OVERTAKING · CATCH UP THE QUEUE',
      delta: null,
      deltaWarning: null,
    });
    const last = raceControl(info({ safetyCar: sc({ inThisLap: true }) }), 'p1', null, 0, names);
    expect(last.title).toBe('SAFETY CAR IN THIS LAP');
  });

  it('at the restart: no overtaking until the line, then racing; no delta', () => {
    const restart = info({ safetyCar: sc({ phase: 'restart', released: ['p2'] }) });
    expect(raceControl(restart, 'p1', null, 0, names)).toMatchObject({
      title: 'SAFETY CAR ENDING',
      rule: 'NO OVERTAKING UNTIL THE LINE',
      delta: null,
    });
    expect(raceControl(restart, 'p2', null, 0, names).rule).toBe('RACING · OVERTAKING ALLOWED');
  });

  it('an overtake to give back, with the seconds left', () => {
    const owed = info({
      safetyCar: sc({}),
      giveBack: [{ attacker: 'p1', victim: 'p2', until: 10 * TICK_RATE }],
    });
    expect(raceControl(owed, 'p1', 0.5, 3 * TICK_RATE, names).giveBack).toBe(
      'GIVE THE PLACE BACK TO KIMI · 7 s',
    );
    expect(raceControl(owed, 'p2', 0.5, 0, names).giveBack).toBeNull();
  });
});

describe('yellowFlagText', () => {
  const flag = (sector: number) => ({
    carId: 'p2',
    point: { x: 0, z: 0 },
    progress: 0,
    sector,
    since: 0,
    until: 900,
  });

  it('the sectors under a yellow flag, in qualifying and the race', () => {
    expect(yellowFlagText(info({ yellowFlags: [flag(1)] }))).toBe(
      'YELLOW FLAG · SECTOR 2 · SLOW DOWN, NO OVERTAKING',
    );
    const two = info({ phase: 'qualifying', yellowFlags: [flag(2), flag(0), flag(2)] });
    expect(yellowFlagText(two)).toBe('YELLOW FLAG · SECTORS 1 & 3 · SLOW DOWN, NO OVERTAKING');
    expect(yellowFlagText(info({}))).toBeNull();
    expect(yellowFlagText(info({ phase: 'results', yellowFlags: [flag(0)] }))).toBeNull();
  });

  it('on the board with the safety car, or alone', () => {
    const one = info({ yellowFlags: [flag(0)] });
    expect(raceControl(one, 'p1', null, 0, names)).toEqual({
      ...NO_RACE_CONTROL,
      flag: yellowFlagText(one),
    });
    const both = raceControl({ ...one, safetyCar: sc({}) }, 'p1', 0, 0, names);
    expect(both.flag).toBe(yellowFlagText(one));
    expect(both.title).toBe('SAFETY CAR');
  });
});

describe('deltaText and penaltyNotice', () => {
  it('formats the delta and the penalties', () => {
    expect(deltaText(0)).toEqual({ text: 'DELTA +0.0', ok: true });
    expect(penaltyNotice({ tick: 0, id: 'p1', reason: 'overtake' })).toBe(
      '5 s TIME PENALTY · OVERTAKING UNDER THE SAFETY CAR',
    );
    expect(penaltyNotice({ tick: 0, id: 'p1', reason: 'delta' })).toBe(
      '5 s TIME PENALTY · SAFETY CAR DELTA NOT RESPECTED',
    );
  });
});

describe('wentGreen', () => {
  it('only when a safety car period ends in the race', () => {
    const under = info({ safetyCar: sc({ phase: 'restart' }) });
    expect(wentGreen(under, info({ safetyCar: null }))).toBe(true);
    expect(wentGreen(under, under)).toBe(false);
    expect(wentGreen(info({}), info({}))).toBe(false);
    expect(wentGreen(null, info({}))).toBe(false);
    // The race over (the flag), not a green flag.
    expect(wentGreen(under, info({ phase: 'results' }))).toBe(false);
  });
});
