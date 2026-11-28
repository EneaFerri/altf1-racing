import {
  DAMAGE_PARAMS,
  findCar,
  findLap,
  length,
  TRACK_RULES,
  type BotLevel,
  type CarId,
  type GameState,
  type LapState,
  pitStatus,
  puncturedTyres,
  type Track,
  type TyreState,
} from '@altf1/shared';
import { DamagePanel } from './DamagePanel';
import {
  defaultLapName,
  formatDelta,
  formatLapTime,
  gpBestColor,
  gpSectorColor,
  sectorColor,
  slipstreamPercent,
  type SectorColor,
} from './format';
import './hud.css';

/** How long the sector / lap chip stays under the strip (ms). */
const CHIP_MS = 3000;

/** Bests as they were when the current lap started: what this lap's sectors are compared with. */
interface Reference {
  readonly bestSectors: readonly (number | null)[];
  readonly bestLapSectors: readonly number[] | null;
}

/**
 * F1-style timing strip, top centre: lap, running time, sector bars, last and best lap, speed,
 * slipstream (SLIP bar + %, the same value as the wind lines). In a Grand Prix the sector bars
 * become a table under the strip: this lap's sector times and the own bests, purple for the
 * session's best of every driver (`setSessionBests`).
 * A chip under it shows each sector's gap to the best lap for a few seconds; in a race with damage,
 * the damage panel bottom right. Reads state only.
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
  private readonly slip = element('span', 'hud-slip');
  private readonly slipFill = element('i', 'hud-slip-fill');
  private readonly slipValue = element('span', 'hud-slip-value');
  private readonly botLevel = element('span', 'hud-bot-level');
  private readonly chip = element('div', 'hud-chip');
  private readonly bot = botLabel(this.botLevel);
  /** Bottom right, only in a race with damage (Grand Prix). */
  private readonly damage = new DamagePanel();
  /** Under the strip, in the pit lane (Grand Prix): the limiter, a stop's countdown. */
  private readonly pit = element('div', 'hud-pit');
  /** The own tyres (Grand Prix): compound and wear. */
  private readonly tyres = element('div', 'hud-tyres');
  /** The track whose pit lane is driven (a Grand Prix); null: none. */
  private pitTrack: Track | null = null;

  private lapStartTick: number | null = null;
  private seenLaps = 0;
  private seenSectors = 0;
  private reference: Reference = { bestSectors: [], bestLapSectors: null };
  private chipUntil = 0;
  /** After a lap, its sector bars stay up while the chip shows; then they clear for the new lap. */
  private clearBarsAt: number | null = null;
  /** Name of the lap being driven (e.g. Q1–Q3 in qualifying, `P2/6 · LAP 3/8` in a race). */
  private lapName = defaultLapName;
  /**
   * A Grand Prix: the session's best sectors of every driver (the server's); null elsewhere. With
   * them, the sectors show as a table: this lap's times and the own bests, F1's colours.
   */
  private sessionBests: readonly (number | null)[] | null = null;
  /** The table's two rows of sector cells: this lap, the own bests. */
  private readonly sectorTable = element('div', 'hud-gp-sectors');
  private readonly lapCells = sectorCells();
  private readonly bestCells = sectorCells();
  /** This lap's sector times as shown (null = not yet), and whether the lap is valid. */
  private lapSectors: (number | null)[] = [];
  /**
   * The own best of each sector, live: taken as each sector is done on a valid lap (the
   * simulation's `bestSectors` only grow at the line, from laps still valid there). Cleared when
   * the timing starts over (a new session).
   */
  private ownBests: (number | null)[] = [];
  private lapValid = true;

  constructor() {
    const strip = element('div', 'hud-strip');
    const sectors = element('span', 'hud-sectors');
    sectors.append(...this.bars);
    const slipBar = element('i', 'hud-slip-bar');
    slipBar.append(this.slipFill);
    this.slip.append(element('span', 'hud-label', 'SLIP'), slipBar, this.slipValue);
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
      this.slip,
      this.bot,
    );
    this.pit.hidden = true;
    this.tyres.hidden = true;
    this.sectors = sectors;
    this.sectorTable.append(
      element('span', 'hud-label'),
      ...Array.from({ length: TRACK_RULES.sectorCount }, (_, i) =>
        element('span', 'hud-label', `S${i + 1}`),
      ),
      element('span', 'hud-label', 'LAP'),
      ...this.lapCells,
      element('span', 'hud-label', 'BEST'),
      ...this.bestCells,
    );
    // A label column, then one per sector.
    this.sectorTable.style.gridTemplateColumns = `auto repeat(${TRACK_RULES.sectorCount}, 4.6em)`;
    this.sectorTable.hidden = true;
    this.root.append(strip, this.sectorTable, this.chip, this.pit, this.tyres);
    document.body.appendChild(this.root);
  }

  /** The strip's sector bars, hidden in a Grand Prix (the table shows the sectors instead). */
  private readonly sectors: HTMLElement;

  /**
   * A Grand Prix: the session's best sectors of every driver, from the server (null: not a Grand
   * Prix). Shows the sector table instead of the bars, coloured against them from now on.
   */
  setSessionBests(bests: readonly (number | null)[] | null): void {
    this.sessionBests = bests;
    this.sectorTable.hidden = bests === null;
    this.sectors.hidden = bests !== null;
  }

  /** How the lap being driven is named from now on (`OUT LAP`, then `LAP n`, by default). */
  setLapName(name: (timing: LapState) => string): void {
    this.lapName = name;
  }

  /** Shows or hides the whole strip (hidden while the own car is off the track). */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
    this.damage.setVisible(visible);
  }

  /** The pit lane of `track` is driven (a Grand Prix): its limiter and stops are shown. */
  usePitLane(track: Track): void {
    this.pitTrack = track;
  }

  /** Removes the bot item (multiplayer: no bot in the room). */
  hideBot(): void {
    this.bot.remove();
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
    this.damage.update(
      car.damage,
      car.damage && puncturedTyres(car.damage, car.tyres, DAMAGE_PARAMS),
    );
    this.showPit(this.pitTrack && pitStatus(this.pitTrack, car, state.tick));
    this.showTyres(car.tyres);

    const running = timing.lapStartTick !== null;
    setText(this.lap, this.lapName(timing));
    setText(this.time, running ? formatLapTime(state.tick - timing.lapStartTick!, 1) : '--:--.-');
    this.invalid.hidden = timing.valid;
    setText(this.last, timing.lastLap ? formatLapTime(timing.lastLap.ticks) : '--:--.---');
    this.last.classList.toggle('hud-struck', timing.lastLap?.valid === false);
    setText(this.best, timing.bestLap ? formatLapTime(timing.bestLap.ticks) : '--:--.---');
    setText(this.speed, `${Math.round(length(car.velocity) * 3.6)}`);
    const slip = slipstreamPercent(car.slipstream);
    setText(this.slipValue, `${slip}%`);
    this.slipFill.style.width = `${slip}%`;
    this.slip.classList.toggle('hud-slip-on', slip > 0);
    this.chip.hidden = nowMs > this.chipUntil;
    if (this.clearBarsAt !== null && nowMs > this.clearBarsAt) {
      for (const bar of this.bars) bar.className = 'hud-bar';
      this.lapSectors = [];
      this.clearBarsAt = null;
    }
    if (this.sessionBests) this.showSectorTable(timing, this.sessionBests);
  }

  /** The own best of each sector: the finished laps' and the live ones (`ownBests`). */
  private personalBests(timing: LapState): (number | null)[] {
    return timing.bestSectors.map((best, i) => {
      const live = this.ownBests[i] ?? null;
      return best === null ? live : live === null ? best : Math.min(best, live);
    });
  }

  /**
   * The Grand Prix's sector table, recoloured every frame against the session's bests (a purple
   * beaten by another driver turns green): this lap's sectors so far, then the own bests.
   */
  private showSectorTable(timing: LapState, session: readonly (number | null)[]): void {
    this.lapCells.forEach((cell, i) => {
      const ticks = this.lapSectors[i] ?? null;
      const color =
        ticks === null
          ? null
          : this.lapValid
            ? gpSectorColor(ticks, this.reference.bestSectors[i] ?? null, session[i] ?? null)
            : 'invalid';
      showCell(cell, ticks, color);
    });
    const own = this.personalBests(timing);
    this.bestCells.forEach((cell, i) => {
      const best = own[i] ?? null;
      showCell(cell, best, best === null ? null : gpBestColor(best, session[i] ?? null));
    });
  }

  /** `SOFT 37%`: the own tyres' compound (its colour) and wear; hidden without tyres. */
  private showTyres(tyres: TyreState | undefined): void {
    this.tyres.hidden = tyres === undefined;
    if (!tyres) return;
    this.tyres.dataset['compound'] = tyres.compound;
    setText(this.tyres, `${tyres.compound.toUpperCase()}  ${Math.round(tyres.wear * 100)}%`);
  }

  /**
   * `PIT STOP 3.4 · 1 SOFT  2 MEDIUM  3 INTER  4 WET` while stopped in the box (the tyres to fit), `PIT LIMITER 76`
   * between the limit lines.
   */
  private showPit(status: ReturnType<typeof pitStatus>): void {
    const text =
      status?.stopLeft != null
        ? `PIT STOP  ${status.stopLeft.toFixed(1)}  ·  1 SOFT  2 MEDIUM  3 INTER  4 WET`
        : status?.limiter
          ? `PIT LIMITER  ${Math.round(status.speedLimit * 3.6)}`
          : '';
    this.pit.hidden = text === '';
    setText(this.pit, text);
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
      if (timing.lapStartTick === null) {
        // Fresh timing (a new session, or the car put back on the track): no bests any more.
        this.ownBests = [];
        this.seenLaps = timing.laps;
      }
      this.reference = {
        bestSectors: this.sessionBests ? this.personalBests(timing) : timing.bestSectors,
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
    const before = bestSectors[index] ?? null;
    const color: SectorColor | 'invalid' = !valid
      ? 'invalid'
      : this.sessionBests
        ? gpSectorColor(ticks, before, this.sessionBests[index] ?? null)
        : sectorColor(ticks, before, bestLapSectors?.[index] ?? null);
    this.lapSectors[index] = ticks;
    this.lapValid = valid;
    const own = this.ownBests[index] ?? null;
    if (valid && (own === null || ticks < own)) this.ownBests[index] = ticks;
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

/** One cell per sector for a row of the Grand Prix's sector table. */
function sectorCells(): HTMLElement[] {
  return Array.from({ length: TRACK_RULES.sectorCount }, () => element('span', 'hud-cell'));
}

/** A sector cell: its time in its colour, or `--` greyed while it has none. */
function showCell(cell: HTMLElement, ticks: number | null, color: string | null): void {
  setText(cell, ticks === null ? '--' : formatLapTime(ticks));
  const className = color === null ? 'hud-cell' : `hud-cell hud-c-${color}`;
  if (cell.className !== className) cell.className = className;
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
