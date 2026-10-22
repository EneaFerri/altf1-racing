import {
  findCar,
  findLap,
  length,
  TRACK_RULES,
  type BotLevel,
  type CarId,
  type GameState,
  type LapState,
} from '@altf1/shared';
import { formatDelta, formatLapTime, sectorColor, type SectorColor } from './format';
import './hud.css';

/** How long the sector / lap chip stays under the strip (ms). */
const CHIP_MS = 3000;

/** Bests as they were when the current lap started: what this lap's sectors are compared with. */
interface Reference {
  readonly bestSectors: readonly (number | null)[];
  readonly bestLapSectors: readonly number[] | null;
}

/**
 * F1-style timing strip, top centre: lap, running time, sector bars, last and best lap, speed.
 * A chip under it shows each sector's gap to the best lap for a few seconds. Reads state only.
 */
export class Hud {
  private readonly root = element('div', 'hud');
  private readonly lap = element('span', 'hud-lap');
  private readonly time = element('span', 'hud-time');
  private readonly invalid = element('span', 'hud-void', 'INVALID');
  private readonly bars = Array.from({ length: TRACK_RULES.sectorCount }, () =>
    element('i', 'hud-bar'),
  );
  private readonly last = element('span', 'hud-value');
  private readonly best = element('span', 'hud-value');
  private readonly speed = element('span', 'hud-speed');
  private readonly botLevel = element('span', 'hud-bot-level');
  private readonly chip = element('div', 'hud-chip');

  private lapStartTick: number | null = null;
  private seenLaps = 0;
  private seenSectors = 0;
  private reference: Reference = { bestSectors: [], bestLapSectors: null };
  private chipUntil = 0;
  /** After a lap, its sector bars stay up while the chip shows; then they clear for the new lap. */
  private clearBarsAt: number | null = null;

  constructor() {
    const strip = element('div', 'hud-strip');
    const sectors = element('span', 'hud-sectors');
    sectors.append(...this.bars);
    strip.append(
      this.lap,
      this.time,
      this.invalid,
      sectors,
      element('span', 'hud-label', 'LAST'),
      this.last,
      element('span', 'hud-label', 'BEST'),
      this.best,
      this.speed,
      botLabel(this.botLevel),
    );
    this.root.append(strip, this.chip);
    document.body.appendChild(this.root);
  }

  /** Shows the bot's level (B cycles it); null = off. The bot's own times are never shown. */
  setBotLevel(level: BotLevel | null): void {
    setText(this.botLevel, level === null ? 'OFF' : level.toUpperCase());
    this.botLevel.classList.toggle('hud-bot-off', level === null);
  }

  /** Call once per rendered frame with the car to show (the local player). */
  update(state: GameState, carId: CarId, nowMs: number): void {
    const timing = findLap(state, carId);
    const car = findCar(state, carId);
    if (!timing || !car) return;

    this.trackEvents(timing, nowMs);

    const running = timing.lapStartTick !== null;
    setText(this.lap, running ? `LAP ${timing.laps + 1}` : 'OUT LAP');
    setText(this.time, running ? formatLapTime(state.tick - timing.lapStartTick!, 1) : '--:--.-');
    this.invalid.hidden = timing.valid;
    setText(this.last, timing.lastLap ? formatLapTime(timing.lastLap.ticks) : '--:--.---');
    this.last.classList.toggle('hud-struck', timing.lastLap?.valid === false);
    setText(this.best, timing.bestLap ? formatLapTime(timing.bestLap.ticks) : '--:--.---');
    setText(this.speed, `${Math.round(length(car.velocity) * 3.6)}`);
    this.chip.hidden = nowMs > this.chipUntil;
    if (this.clearBarsAt !== null && nowMs > this.clearBarsAt) {
      for (const bar of this.bars) bar.className = 'hud-bar';
      this.clearBarsAt = null;
    }
  }

  /** Colours finished sectors and shows the chip; snapshots the bests when a new lap starts. */
  private trackEvents(timing: LapState, nowMs: number): void {
    const last = TRACK_RULES.sectorCount - 1;
    let lapFinished = false;
    if (timing.laps !== this.seenLaps && timing.lastLap) {
      const lapTime = timing.lastLap;
      this.showSector(last, lapTime.sectors, lapTime.valid, nowMs);
      setText(this.chip, `${this.chip.textContent} · LAP ${formatLapTime(lapTime.ticks)}`);
      this.seenLaps = timing.laps;
      lapFinished = true;
    }
    if (timing.lapStartTick !== this.lapStartTick) {
      this.lapStartTick = timing.lapStartTick;
      this.seenSectors = 0;
      this.reference = {
        bestSectors: timing.bestSectors,
        bestLapSectors: timing.bestLap?.sectors ?? null,
      };
      this.clearBarsAt = lapFinished ? this.chipUntil : nowMs;
    }
    while (this.seenSectors < timing.currentSectors.length) {
      this.showSector(this.seenSectors, timing.currentSectors, timing.valid, nowMs);
      this.seenSectors++;
    }
  }

  private showSector(
    index: number,
    sectors: readonly number[],
    valid: boolean,
    nowMs: number,
  ): void {
    const ticks = sectors[index]!;
    const { bestSectors, bestLapSectors } = this.reference;
    const color: SectorColor | 'invalid' = valid
      ? sectorColor(ticks, bestSectors[index] ?? null, bestLapSectors?.[index] ?? null)
      : 'invalid';
    this.bars[index]!.className = `hud-bar hud-c-${color}`;

    // Gap to the best lap at the same point, or the sector time if there is no best lap yet.
    const upTo = (list: readonly number[]): number =>
      list.slice(0, index + 1).reduce((sum, t) => sum + t, 0);
    const gap = bestLapSectors
      ? formatDelta(upTo(sectors) - upTo(bestLapSectors))
      : formatLapTime(ticks);
    this.chip.className = `hud-chip hud-c-${color}`;
    setText(this.chip, `S${index + 1}  ${gap}`);
    this.chipUntil = nowMs + CHIP_MS;
  }
}

/** `● BOT <level>`, the dot in the bot's livery colour. */
function botLabel(level: HTMLElement): HTMLElement {
  const label = element('span', 'hud-bot');
  label.append(element('i', 'hud-bot-dot'), element('span', 'hud-label', 'BOT'), level);
  return label;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** Touches the DOM only when the text really changes (the HUD updates every frame). */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
