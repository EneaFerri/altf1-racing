import {
  damageInPhase,
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
export type GrandPrixRoom = Pick<
  Room,
  'state' | 'restart' | 'retire' | 'spawn' | 'hold' | 'setDamage' | 'setPitBoxes'
>;

/**
 * The rules of one circuit's Grand Prix, driving its room through the phases: lobby (free driving)
 * → qualifying (back on the grid, 3 timed laps each, then off the track) → grid (in qualifying
 * order, held) → race (start lights, timing at every line, finishers off the track) → results →
 * (play again) a new lobby on the same circuit, for whoever asks for it.
 * The first player in is the manager; if they leave, the one who has been there longest takes
 * over. Only the manager's commands count, apart from play again.
 * Pure apart from `random` (lights out). See 01_docs/multiplayer.md#grand-prix.
 */
export class GrandPrix {
  private phase: GrandPrixPhase = 'lobby';
  /** Players in the Grand Prix, in arrival order: the first is the manager. */
  private drivers: CarId[] = [];
  private readonly names = new Map<CarId, string>();
  /** Each driver's pit box: the lowest free one on joining, kept until leaving. */
  private readonly boxes = new Map<CarId, number>();
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

  /** Whether laps driven now are timed ones (qualifying or race): those go into the lap records. */
  get isTimed(): boolean {
    return this.phase === 'qualifying' || this.phase === 'race';
  }

  get info(): GrandPrixInfo {
    return {
      phase: this.phase,
      manager: this.drivers[0] ?? null,
      drivers: [...this.drivers],
      qualifying: this.order(),
      race: raceStandings([...this.racers.values()], this.room.hold?.until ?? 0),
      raceLaps: this.raceLaps,
      hold: this.room.hold,
      boxes: Object.fromEntries(this.boxes),
    };
  }

  add(id: CarId, name: string): void {
    this.drivers.push(id);
    this.names.set(id, name);
    this.giveBox(id);
  }

  /** A player left: out of the Grand Prix (a disconnected driver doesn't come back; racing: DNF). */
  remove(id: CarId): void {
    const index = this.drivers.indexOf(id);
    if (index >= 0) this.drivers.splice(index, 1);
    if (this.boxes.delete(id)) this.room.setPitBoxes(Object.fromEntries(this.boxes));
    this.results.delete(id);
    if (this.drivers.length === 0) return; // nobody left to move the GP on
    if (this.phase === 'qualifying' && this.allDone()) this.toGrid();
    const racer = this.racers.get(id);
    if (this.phase === 'race' && racer?.status === 'running') {
      this.racers.set(id, { ...racer, status: 'dnf' });
      if (!this.anyRacing()) this.setPhase('results');
    }
  }

  /** Applies `command` if `id` is the manager and it fits the phase; whether anything changed. */
  command(id: CarId, command: GrandPrixCommand): boolean {
    if (command.action === 'playAgain') return this.playAgain(id);
    if (id !== this.drivers[0]) return false;
    if (command.action === 'start' && this.phase === 'lobby') {
      this.setPhase('qualifying');
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
      this.setPhase('race');
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
      this.setPhase('results'); // whoever is still racing is classified where they are
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

  /**
   * Player `id` (in the room) wants another GP: in the results, the GP starts over as a lobby
   * with `id` alone (the manager; the other cars leave the track while their players are on the
   * results card); in that lobby, `id` joins it with a car on the grid. Whether anything changed.
   */
  private playAgain(id: CarId): boolean {
    if (this.phase === 'results') {
      this.setPhase('lobby');
      this.drivers = [id];
      this.boxes.clear();
      this.giveBox(id);
      this.results.clear();
      this.racers.clear();
      this.raceLaps = null;
      this.room.hold = null;
      this.room.restart([id]);
      return true;
    }
    if (this.phase !== 'lobby' || this.drivers.includes(id)) return false;
    this.drivers.push(id);
    this.giveBox(id);
    this.room.spawn(id);
    return true;
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
    if (changed && !this.anyRacing()) this.setPhase('results');
    return changed;
  }

  /** `id`'s pit box: the lowest no driver has, told to the room. */
  private giveBox(id: CarId): void {
    const taken = new Set(this.boxes.values());
    let box = 0;
    while (taken.has(box)) box++;
    this.boxes.set(id, box);
    this.room.setPitBoxes(Object.fromEntries(this.boxes));
  }

  /** Every phase change goes through here: the room's damage follows the phase (`damageInPhase`). */
  private setPhase(phase: GrandPrixPhase): void {
    this.phase = phase;
    this.room.setDamage(damageInPhase(phase));
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
    this.setPhase('grid');
    this.room.restart(this.order().map((entry) => entry.id));
    this.room.hold = HELD;
  }
}
