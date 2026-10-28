import {
  GRAND_PRIX,
  HELD,
  qualifyingOrder,
  raceStandings,
  startHold,
  timingLinesPassed,
  type CarId,
  type GrandPrixCommand,
  type GrandPrixInfo,
  type GrandPrixPhase,
  type QualifyingEntry,
  type RaceDriver,
  type RaceLaps,
} from '@altf1/shared';
import type { Room } from './Room.ts';

/** What the Grand Prix needs from its room's simulation. */
export type GrandPrixRoom = Pick<Room, 'state' | 'restart' | 'retire' | 'hold'>;

/**
 * The rules of one circuit's Grand Prix, driving its room through the phases: lobby (free driving)
 * → qualifying (back on the grid, 3 timed laps each, then off the track) → grid (in qualifying
 * order, held) → race (start lights, timing at every line, finishers off the track) → results.
 * The first player in is the manager; if they leave, the one who has been there longest takes
 * over. Only the manager's commands count.
 * Pure apart from `random` (lights out). See 01_docs/multiplayer.md#grand-prix.
 */
export class GrandPrix {
  private phase: GrandPrixPhase = 'lobby';
  /** Players in the Grand Prix, in arrival order: the first is the manager. */
  private readonly drivers: CarId[] = [];
  private readonly names = new Map<CarId, string>();
  /** Qualifying by driver, from the start of qualifying on. */
  private readonly results = new Map<CarId, QualifyingEntry>();
  /** The race by driver, in grid order, from the start on (a driver who left stays, DNF). */
  private readonly racers = new Map<CarId, RaceDriver>();
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
      race: raceStandings([...this.racers.values()], this.room.hold?.until ?? 0),
      raceLaps: this.raceLaps,
      hold: this.room.hold,
    };
  }

  add(id: CarId, name: string): void {
    this.drivers.push(id);
    this.names.set(id, name);
  }

  /** A player left: out of the Grand Prix (a disconnected driver doesn't come back; racing: DNF). */
  remove(id: CarId): void {
    const index = this.drivers.indexOf(id);
    if (index >= 0) this.drivers.splice(index, 1);
    this.results.delete(id);
    if (this.drivers.length === 0) return; // the room closes with its last player
    if (this.phase === 'qualifying' && this.allDone()) this.toGrid();
    const racer = this.racers.get(id);
    if (this.phase === 'race' && racer?.status === 'running') {
      this.racers.set(id, { ...racer, status: 'dnf' });
      if (!this.anyRacing()) this.phase = 'results';
    }
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
      for (const { id } of this.order()) {
        this.racers.set(id, {
          id,
          name: this.names.get(id)!,
          passes: [],
          status: 'running',
          best: null,
        });
      }
      return true;
    }
    if (command.action === 'endRace' && this.phase === 'race') {
      this.phase = 'results'; // whoever is still racing is classified where they are
      return true;
    }
    return false;
  }

  /**
   * Reads the room after a tick: in qualifying, records finished timed laps, takes off the track
   * whoever has driven all of theirs and ends qualifying once everyone has; in the race, records
   * every timing line passed, takes finishers off the track and ends the race once nobody is
   * racing. Whether the GP changed.
   */
  afterTick(): boolean {
    if (this.phase === 'race') return this.raceTick();
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

  private raceTick(): boolean {
    const { tick, laps } = this.room.state;
    let changed = false;
    for (const lap of laps) {
      const racer = this.racers.get(lap.carId);
      const lines = timingLinesPassed(lap);
      if (racer?.status !== 'running' || lines <= racer.passes.length) continue;
      const finished = lap.laps >= this.raceLaps!;
      this.racers.set(lap.carId, {
        ...racer,
        // One line per tick at most while driving; any skipped one is timed now.
        passes: [...racer.passes, ...Array<number>(lines - racer.passes.length).fill(tick)],
        status: finished ? 'finished' : 'running',
        best: lap.bestLap?.ticks ?? null,
      });
      if (finished) this.room.retire(lap.carId);
      changed = true;
    }
    if (changed && !this.anyRacing()) this.phase = 'results';
    return changed;
  }

  private anyRacing(): boolean {
    return [...this.racers.values()].some((racer) => racer.status === 'running');
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
