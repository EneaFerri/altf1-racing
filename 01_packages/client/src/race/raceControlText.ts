import {
  SAFETY_CAR_PARAMS,
  TICK_RATE,
  yellowSectors,
  type CarId,
  type GrandPrixInfo,
  type RaceIncident,
} from '@altf1/shared';
import type { RaceControlContent } from '../view/hud/RaceControlBoard';

export const NO_RACE_CONTROL: RaceControlContent = {
  flag: null,
  title: null,
  rule: null,
  delta: null,
  deltaWarning: null,
  giveBack: null,
};

/**
 * The board for player `ownId` at `tick`: the yellow flags out (qualifying and the race), the
 * safety car's phase, the rule, the player's `delta` (s, null without one; only while the safety
 * car waits for the leader) with `graceLeft` (s left to get back above it, null: not beating it)
 * and any overtake to give back (`nameOf`: how a driver is called).
 */
export function raceControl(
  info: GrandPrixInfo,
  ownId: CarId,
  delta: number | null,
  tick: number,
  nameOf: (id: CarId) => string,
  graceLeft: number | null = null,
): RaceControlContent {
  const flag = yellowFlagText(info);
  const sc = info.phase === 'race' ? info.safetyCar : null;
  const owed = (info.giveBack ?? []).find((g) => g.attacker === ownId);
  const giveBack = owed
    ? `GIVE THE PLACE BACK TO ${nameOf(owed.victim).toUpperCase()} · ${Math.max(
        0,
        Math.ceil((owed.until - tick) / TICK_RATE),
      )} s`
    : null;
  if (!sc) {
    return flag || giveBack ? { ...NO_RACE_CONTROL, flag, giveBack } : NO_RACE_CONTROL;
  }
  const released = sc.released.includes(ownId);
  const title =
    sc.phase === 'restart'
      ? 'SAFETY CAR ENDING'
      : sc.inThisLap
        ? 'SAFETY CAR IN THIS LAP'
        : 'SAFETY CAR';
  const rule =
    sc.phase === 'restart'
      ? released
        ? 'RACING · OVERTAKING ALLOWED'
        : 'NO OVERTAKING UNTIL THE LINE'
      : sc.phase === 'in'
        ? 'NO OVERTAKING · SAFETY CAR GOING IN'
        : sc.phase === 'out'
          ? 'NO OVERTAKING · CATCH UP THE QUEUE'
          : 'NO OVERTAKING · KEEP ABOVE YOUR DELTA';
  const underDelta = sc.phase === 'deployed' && delta !== null;
  return {
    flag,
    title,
    rule,
    delta: underDelta ? deltaText(delta) : null,
    deltaWarning:
      underDelta && graceLeft !== null
        ? `BACK ABOVE YOUR DELTA · ${Math.max(0, Math.ceil(graceLeft))} s`
        : null,
    giveBack,
  };
}

/**
 * The yellow flags out (qualifying and the race), as race control tells them: `YELLOW FLAG ·
 * SECTOR 2 · SLOW DOWN, NO OVERTAKING` (sectors 1-based, all of them); null: none.
 */
export function yellowFlagText(info: GrandPrixInfo): string | null {
  if (info.phase !== 'qualifying' && info.phase !== 'race') return null;
  const sectors = yellowSectors(info.yellowFlags ?? []).map((sector) => sector + 1);
  if (sectors.length === 0) return null;
  const which = sectors.length === 1 ? `SECTOR ${sectors[0]}` : `SECTORS ${sectors.join(' & ')}`;
  return `YELLOW FLAG · ${which} · SLOW DOWN, NO OVERTAKING`;
}

/** A delta as shown: `+1.2` (ok: slower than the reference) or `−0.4` (too fast). */
export function deltaText(delta: number): { readonly text: string; readonly ok: boolean } {
  const rounded = Math.round(delta * 10) / 10;
  const text = `${rounded >= 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
  return { text: `DELTA ${text}`, ok: delta >= 0 };
}

/** Race control's word when a safety car period ends, the leader across the line. */
export const GREEN_FLAG_NOTICE = 'GREEN FLAG · RACING · OVERTAKING ALLOWED';

/** Whether the race went green between `before` and `now`: a safety car period just over. */
export function wentGreen(before: GrandPrixInfo | null, now: GrandPrixInfo): boolean {
  return before?.phase === 'race' && !!before.safetyCar && now.phase === 'race' && !now.safetyCar;
}

/** A penalty as told to its driver. */
export function penaltyNotice(incident: RaceIncident): string {
  const seconds = SAFETY_CAR_PARAMS.penalty;
  return incident.reason === 'delta'
    ? `${seconds} s TIME PENALTY · SAFETY CAR DELTA NOT RESPECTED`
    : `${seconds} s TIME PENALTY · OVERTAKING UNDER THE SAFETY CAR`;
}
