import { GRAND_PRIX } from '../config/grandPrix';
import { TRACK_RULES } from '../config/track';
import { SAFETY_CAR_PARAMS } from '../config/safetyCar';
import { TICK_RATE } from '../config/sim';
import { offersRain, wetnessAt, type Forecast, type Weather } from '../config/weather';
import type { GrandPrixCommand, GrandPrixInfo, GrandPrixPhase } from '../net/protocol';
import type { CarId } from '../sim/car';
import type { GameState } from '../sim/game';
import type { Track, TrackDefinition } from '../track/types';
import { stepYellowFlags, type YellowFlag } from './flags';
import { damageInPhase } from './damage';
import { drawWeatherTurn, forecastBefore, raceForecast, type WeatherTurn } from './forecast';
import { HELD, startHold, type StartHold } from './hold';
import { qualifyingOrder, type QualifyingEntry } from './qualifying';
import { safetyCarWet, SafetyCarDirector, type SafetyCarRoom } from './safetyCar';
import { raceStandings, timingLinesPassed, type RaceDriver } from './standings';

/**
 * What the Grand Prix needs from its room's simulation: the server's `Room` online, single
 * player's own room offline (both modes run the same rules).
 */
export interface GrandPrixRoom {
  readonly definition: TrackDefinition;
  /** The track it runs on (with its pit lane): where a crash's yellow flag is. */
  readonly track: Track;
  readonly state: GameState;
  /** Cars held on the grid (and the start lights); null while they may drive. */
  hold: StartHold | null;
  /** Every car in `order` back on the grid (the others off the track), timing reset. */
  restart(order: readonly CarId[]): void;
  /** Takes a car off the track (its driver is done). */
  retire(id: CarId): void;
  /** Puts a car back on the track. */
  spawn(id: CarId): void;
  setDamage(on: boolean): void;
  setPitBoxes(boxes: Readonly<Record<CarId, number>>): void;
  /** How wet the track is when (`forecastBefore`, `raceForecast`). */
  setWeather(forecast: Forecast): void;
}

/** How a Grand Prix runs beyond the rules every one has. */
export interface GrandPrixOptions {
  /**
   * The safety car (R.3, 01_docs/safetycar.md): the room that drives it (the server's; single
   * player's Grand Prix has none, owner 2026-11-24). Left out: no safety car.
   */
  readonly safetyCar?: SafetyCarRoom;
}

/**
 * The rules of one circuit's Grand Prix, driving its room through the phases: lobby (free driving)
 * → qualifying (back on the grid, 3 timed laps each, then off the track) → grid (in qualifying
 * order, held) → race (start lights, timing at every line, finishers off the track) → results →
 * (play again) a new lobby on the same circuit, for whoever asks for it.
 * The first player in is the manager; if they leave, the one who has been there longest takes
 * over. Only the manager's commands count, apart from play again. In the lobby the manager also
 * chooses the weather (the rain, or the variable weather, only where `offersRain`), kept for the
 * whole GP and play again; a variable GP's turn (`drawWeatherTurn`) is drawn when chosen (and
 * again for play again), its timing when the race starts (`raceForecast`).
 * Pure apart from `random` (lights out, the weather). See 01_docs/multiplayer.md#grand-prix.
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
  private raceLaps: number | null = null;
  /** Chosen by the manager in the lobby (on a track that `offersRain`), kept for play again. */
  private weather: Weather = 'dry';
  /** A variable GP's turn of weather; null otherwise. */
  private turn: WeatherTurn | null = null;
  /** How wet the track is when: the room's, sent to every machine. */
  private forecast: Forecast = forecastBefore('dry', null);
  /** The session's (phase's) best time of each sector over every driver; reset by `setPhase`. */
  private sectorBests: (number | null)[] = noSectorBests();
  /** Drivers with a given qualifying time (`addSimulated`), by id. */
  private readonly simulated = new Map<CarId, number>();
  /** Crashes' debris and yellow flags out now (R.2: qualifying and the race). */
  private yellowFlags: readonly YellowFlag[] = [];
  /** The race's last counted pit stop of each driver (its end tick). */
  private readonly stopsCounted = new Map<CarId, number>();
  /**
   * The race's safety car (R.3, multiplayer only: `GrandPrixOptions.safetyCar`): its periods, the
   * delta, the overtakes and their penalties; null without one.
   */
  private readonly safety: { director: SafetyCarDirector; room: SafetyCarRoom } | null;
  /** Penalties of `safety` already added to their drivers. */
  private penaltiesGiven = 0;
  private readonly room: GrandPrixRoom;
  /** Draws lights out (0..1); tests pass a fixed one. */
  private readonly random: () => number;

  constructor(
    room: GrandPrixRoom,
    random: () => number = Math.random,
    options: GrandPrixOptions = {},
  ) {
    this.room = room;
    this.random = random;
    this.safety = options.safetyCar
      ? { director: new SafetyCarDirector(), room: options.safetyCar }
      : null;
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
      // In the results every classified driver's pit penalty counts (01_docs/multiplayer.md).
      race: raceStandings(
        [...this.racers.values()],
        this.room.hold?.until ?? 0,
        this.phase === 'results',
      ),
      raceLaps: this.raceLaps,
      hold: this.room.hold,
      boxes: Object.fromEntries(this.boxes),
      weather: this.weather,
      forecast: this.forecast,
      sectorBests: [...this.sectorBests],
      yellowFlags: this.yellowFlags,
      ...(this.safety && {
        safetyCar: this.safety.director.info,
        giveBack: [...this.safety.director.giveBack],
        incidents: [...this.safety.director.incidents],
      }),
    };
  }

  add(id: CarId, name: string): void {
    this.drivers.push(id);
    this.names.set(id, name);
    this.giveBox(id);
  }

  /**
   * A driver whose qualifying is given instead of driven (single player's bots: their time
   * simulated, `best` in ticks): in qualifying it is already done with that time and stays off the
   * track; from the grid on it races like everyone.
   */
  addSimulated(id: CarId, name: string, best: number): void {
    this.add(id, name);
    this.simulated.set(id, best);
  }

  /** A player left: out of the Grand Prix (a disconnected driver doesn't come back; racing: DNF). */
  remove(id: CarId): void {
    const index = this.drivers.indexOf(id);
    if (index >= 0) this.drivers.splice(index, 1);
    if (this.boxes.delete(id)) this.room.setPitBoxes(Object.fromEntries(this.boxes));
    this.results.delete(id);
    this.simulated.delete(id);
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
    if (command.action === 'weather' && this.phase === 'lobby') {
      const allowed = command.weather === 'dry' || offersRain(this.room.definition.name);
      if (!allowed || command.weather === this.weather) return false;
      this.weather = command.weather;
      this.newTurn();
      return true;
    }
    if (command.action === 'start' && this.phase === 'lobby') {
      this.setPhase('qualifying');
      for (const driver of this.drivers) {
        const given = this.simulated.get(driver);
        this.results.set(
          driver,
          given === undefined
            ? { id: driver, best: null, setAt: null, laps: 0, done: false }
            : { id: driver, best: given, setAt: 0, laps: GRAND_PRIX.qualifyingLaps, done: true },
        );
      }
      // Only those who drive their qualifying go out on track.
      this.room.restart(this.drivers.filter((driver) => !this.simulated.has(driver)));
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
      if (this.turn) {
        const { until } = this.room.hold;
        const { length } = this.room.track;
        this.forecast = raceForecast(this.turn, until, command.laps, length, this.random);
        this.room.setWeather(this.forecast);
      }
      for (const { id } of this.order()) {
        this.racers.set(id, {
          id,
          name: this.names.get(id)!,
          passes: [],
          status: 'running',
          best: null,
          stops: 0,
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
   * Reads the room after a tick: in every phase, the session's best sectors; in qualifying, records finished timed laps, takes off the track
   * whoever has driven all of theirs and ends qualifying once everyone has; in the race, records
   * every timing line passed, takes finishers off the track and ends the race once nobody is
   * racing. Whether the GP changed.
   */
  afterTick(): boolean {
    // Before anyone is retired: a best set on a driver's last lap still counts.
    const flags = this.flagsTick();
    const bests = this.newSectorBests() || flags;
    if (this.phase === 'race') return this.raceTick() || bests;
    if (this.phase !== 'qualifying') return bests;
    let changed = bests;
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
      this.simulated.clear();
      this.racers.clear();
      this.stopsCounted.clear();
      this.raceLaps = null;
      this.room.hold = null;
      this.newTurn();
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
    const { tick, laps, cars } = this.room.state;
    let changed = false;
    // A pit stop counts when it begins (one per pass through the pits).
    for (const car of cars) {
      const racer = this.racers.get(car.id);
      if (!car.pitStop || racer?.status !== 'running') continue;
      if (this.stopsCounted.get(car.id) === car.pitStop.until) continue;
      this.stopsCounted.set(car.id, car.pitStop.until);
      this.racers.set(car.id, { ...racer, stops: racer.stops + 1 });
      changed = true;
    }
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
    if (this.safety && this.anyRacing()) changed = this.safetyCarTick(this.safety) || changed;
    if (changed && !this.anyRacing()) this.setPhase('results');
    return changed;
  }

  /** The safety car's tick (R.3), and the penalties it gave added to their drivers' race time. */
  private safetyCarTick(safety: { director: SafetyCarDirector; room: SafetyCarRoom }): boolean {
    const start = this.room.hold?.until ?? 0;
    const running = raceStandings([...this.racers.values()], start)
      .filter((standing) => standing.status === 'running')
      .map((standing) => standing.id);
    const wet = safetyCarWet(wetnessAt(this.forecast, this.room.state.tick));
    const changed = safety.director.tick(safety.room, {
      running,
      raceLaps: this.raceLaps!,
      started: this.room.state.tick >= start,
      ...(wet && { wet }),
    });
    const { incidents } = safety.director;
    for (; this.penaltiesGiven < incidents.length; this.penaltiesGiven++) {
      const { id } = incidents[this.penaltiesGiven]!;
      const racer = this.racers.get(id);
      if (!racer) continue;
      const penalty = Math.round(SAFETY_CAR_PARAMS.penalty * TICK_RATE);
      this.racers.set(id, { ...racer, timePenalty: (racer.timePenalty ?? 0) + penalty });
    }
    return changed;
  }

  /** In qualifying and the race, the crashes' yellow flags (`stepYellowFlags`); whether they changed. */
  private flagsTick(): boolean {
    if (!this.isTimed) return false;
    const next = stepYellowFlags(this.yellowFlags, this.room.state, this.room.track, this.drivers);
    if (next === this.yellowFlags) return false;
    this.yellowFlags = next;
    return true;
  }

  /**
   * Takes every car's sector times into the session's bests, live: each sector as soon as it is
   * done on a lap still valid (`currentSectors`; read every tick, so one voided later still
   * counted), and the bests of finished valid laps (`bestSectors`: the last sector, at the line).
   * Whether any improved.
   */
  private newSectorBests(): boolean {
    let improved = false;
    const take = (time: number | null, i: number): void => {
      const best = this.sectorBests[i] ?? null;
      if (time === null || (best !== null && time >= best)) return;
      this.sectorBests[i] = time;
      improved = true;
    };
    for (const lap of this.room.state.laps) {
      lap.bestSectors.forEach(take);
      if (lap.valid) lap.currentSectors.forEach(take);
    }
    return improved;
  }

  /** The weather from the lobby on: a variable GP's turn drawn afresh; told to the room. */
  private newTurn(): void {
    this.turn = this.weather === 'variable' ? drawWeatherTurn(this.random) : null;
    this.forecast = forecastBefore(this.weather, this.turn);
    this.room.setWeather(this.forecast);
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
    // A new race, or none: no safety car, nothing owed.
    if (this.safety && (phase !== this.phase || phase === 'race')) {
      this.safety.director.reset(this.safety.room);
      this.penaltiesGiven = 0;
    }
    this.phase = phase;
    this.sectorBests = noSectorBests(); // a new session, with its own bests
    this.yellowFlags = []; // and a clean track
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

/** No sector timed yet: one null per sector. */
function noSectorBests(): (number | null)[] {
  return Array<number | null>(TRACK_RULES.sectorCount).fill(null);
}
