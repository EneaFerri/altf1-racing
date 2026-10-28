import {
  GRAND_PRIX,
  HELD,
  qualifyingOrder,
  startHold,
  type CarId,
  type GrandPrixCommand,
  type GrandPrixInfo,
  type GrandPrixPhase,
  type QualifyingEntry,
  type RaceLaps,
} from '@altf1/shared';
import type { Room } from './Room.ts';

/** What the Grand Prix needs from its room's simulation. */
export type GrandPrixRoom = Pick<Room, 'state' | 'restart' | 'retire' | 'hold'>;

/**
 * The rules of one circuit's Grand Prix, driving its room through the phases: lobby (free driving)
 * → qualifying (back on the grid, 3 timed laps each, then off the track) → grid (in qualifying
 * order, held) → race (start lights, then racing). The first player in is the manager; if they
 * leave, the one who has been there longest takes over. Only the manager's commands count.
 * Pure apart from `random` (lights out). See 01_docs/multiplayer.md#grand-prix.
 */
export class GrandPrix {
  private phase: GrandPrixPhase = 'lobby';
  /** Players in the Grand Prix, in arrival order: the first is the manager. */
  private readonly drivers: CarId[] = [];
  /** Qualifying by driver, from the start of qualifying on. */
  private readonly results = new Map<CarId, QualifyingEntry>();
  private raceLaps: RaceLaps | null = null;
  private readonly room: GrandPrixRoom;
  /** Draws lights out (0..1); tests pass a fixed one. */
  private readonly random: () => number;

  constructor(room: GrandPrixRoom, random: () => number = Math.random) {
    this.room = room;
    this.random = random;
  }

  /** Whether newcomers may still enter: only while waiting in the lobby. */
  get isOpen(): boolean {
    return this.phase === 'lobby';
  }

  get info(): GrandPrixInfo {
    return {
      phase: this.phase,
      manager: this.drivers[0]!,
      qualifying: this.order(),
      raceLaps: this.raceLaps,
      hold: this.room.hold,
    };
  }

  add(id: CarId): void {
    this.drivers.push(id);
  }

  /** A player left: out of the Grand Prix (a disconnected driver doesn't come back). */
  remove(id: CarId): void {
    const index = this.drivers.indexOf(id);
    if (index >= 0) this.drivers.splice(index, 1);
    this.results.delete(id);
    if (this.phase === 'qualifying' && this.drivers.length > 0 && this.allDone()) this.toGrid();
  }

  /** Applies `command` if `id` is the manager and it fits the phase; whether anything changed. */
  command(id: CarId, command: GrandPrixCommand): boolean {
    if (id !== this.drivers[0]) return false;
    if (command.action === 'start' && this.phase === 'lobby') {
      this.phase = 'qualifying';
      for (const driver of this.drivers) {
        this.results.set(driver, { id: driver, best: null, setAt: null, laps: 0, done: false });
      }
      this.room.restart(this.drivers);
      return true;
    }
    if (command.action === 'endQualifying' && this.phase === 'qualifying') {
      this.toGrid();
      return true;
    }
    if (command.action === 'startRace' && this.phase === 'grid') {
      this.phase = 'race';
      this.raceLaps = command.laps;
      this.room.hold = startHold(this.room.state.tick, this.random());
      return true;
    }
    return false;
  }

  /**
   * Reads the room after a tick: in qualifying, records finished timed laps, takes off the track
   * whoever has driven all of theirs and ends qualifying once everyone has. Whether the GP changed.
   */
  afterTick(): boolean {
    if (this.phase !== 'qualifying') return false;
    let changed = false;
    for (const lap of this.room.state.laps) {
      const entry = this.results.get(lap.carId);
      if (!entry || entry.done || lap.laps === entry.laps) continue;
      const time = lap.lastLap?.valid ? lap.lastLap.ticks : null;
      const better = time !== null && (entry.best === null || time < entry.best);
      const done = lap.laps >= GRAND_PRIX.qualifyingLaps;
      this.results.set(lap.carId, {
        ...entry,
        best: better ? time : entry.best,
        setAt: better ? this.room.state.tick : entry.setAt,
        laps: lap.laps,
        done,
      });
      if (done) this.room.retire(lap.carId);
      changed = true;
    }
    if (changed && this.allDone()) this.toGrid();
    return changed;
  }

  /** Qualifying so far, in order; the drivers without an entry yet (lobby) are left out. */
  private order(): QualifyingEntry[] {
    const entries = this.drivers.flatMap((id) => this.results.get(id) ?? []);
    return qualifyingOrder(entries);
  }

  private allDone(): boolean {
    return this.drivers.every((id) => this.results.get(id)?.done);
  }

  /** Every car back on the grid in qualifying order, held until the manager starts the race. */
  private toGrid(): void {
    this.phase = 'grid';
    this.room.restart(this.order().map((entry) => entry.id));
    this.room.hold = HELD;
  }
}
