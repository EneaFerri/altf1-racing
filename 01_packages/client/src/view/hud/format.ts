import { TICK_RATE, type LapState } from '@altf1/shared';

/** Colour of a sector time, F1 style. */
export type SectorColor = 'purple' | 'green' | 'yellow';

const ticksToMs = (ticks: number): number => Math.round((ticks * 1000) / TICK_RATE);

/** `1:23.456`, or `23.456` under a minute. `decimals` 1 gives the live-running `1:23.4`. */
export function formatLapTime(ticks: number, decimals: 1 | 3 = 3): string {
  const ms = ticksToMs(ticks);
  const minutes = Math.floor(ms / 60000);
  const seconds = (ms % 60000) / 1000;
  const text = decimals === 3 ? seconds.toFixed(3) : (Math.floor(seconds * 10) / 10).toFixed(1);
  return minutes > 0 ? `${minutes}:${text.padStart(decimals + 3, '0')}` : text;
}

/** Signed gap in seconds: `+0.214` slower, `−0.120` faster (true minus sign). */
export function formatDelta(ticks: number): string {
  const seconds = ticksToMs(Math.abs(ticks)) / 1000;
  return `${ticks < 0 ? '−' : '+'}${seconds.toFixed(3)}`;
}

/** Slipstream factor 0..1 as a whole percentage: the number the HUD shows. */
export function slipstreamPercent(factor: number): number {
  return Math.round(Math.min(1, Math.max(0, factor)) * 100);
}

/**
 * purple = best ever for this sector (or the first time), green = faster than the same sector of
 * the best lap, yellow = slower. `best` and `bestLapSector` are the values before this sector.
 */
export function sectorColor(
  ticks: number,
  best: number | null,
  bestLapSector: number | null,
): SectorColor {
  if (best === null || ticks < best) return 'purple';
  if (bestLapSector !== null && ticks < bestLapSector) return 'green';
  return 'yellow';
}

/** `OUT LAP` before the first crossing of the line, then `LAP n`. */
export function defaultLapName(timing: LapState): string {
  return timing.lapStartTick === null ? 'OUT LAP' : `LAP ${timing.laps + 1}`;
}
