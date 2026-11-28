import { NEW_BOT_MEMORY, botInput } from '../ai/driver';
import { buildBotPlan, buildPitPlan, type BotPlan } from '../ai/plan';
import { BOT_PARAMS } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { DAMAGE_PARAMS } from '../config/damage';
import { PIT_PARAMS } from '../config/pit';
import { SAFETY_CAR_PARAMS, type SafetyCarParams } from '../config/safetyCar';
import { FIXED_DT, TICK_RATE } from '../config/sim';
import { SLOPE_PARAMS } from '../config/slope';
import { WET_PARAMS, type WetParams } from '../config/weather';
import { distance, length } from '../math/vec2';
import { SAFETY_CAR_ID, type CarId, type CarState } from '../sim/car';
import { isPunctured, puncturedTyres } from '../sim/damage';
import { findCar, findLap, type GameState, type InputMap } from '../sim/game';
import type { Vec2 } from '../math/vec2';
import { NEUTRAL_INPUT } from '../types/input';
import { inLimit, pitLanePlace } from '../sim/pit';
import { locateOnLoop } from '../track/query';
import type { Track } from '../track/types';
import type { InputCommand } from '../types/input';

/**
 * A safety car period (R.3, 01_docs/safetycar.md), in its phases:
 * - `deployed`: called; every car under the delta; the safety car waits at the pit exit for the
 *   leader (called again while it was going in, from the pit lane at once to it);
 * - `out`: on track ahead of the leader for one lap, no more delta: the field races to the queue
 *   (`inThisLap`: its lights out, it goes in at the end of this lap);
 * - `in`: turning into the pit lane;
 * - `restart`: gone; no overtaking until each car crosses the control line (`released`).
 * Throughout, no overtaking. Green flag, the period over, once the leader crosses the control line
 * with the safety car in the pit lane or gone. A new crash while it goes in (its last lap, `in` or
 * `restart`) calls it out again at once.
 */
export type SafetyCarPhase = 'deployed' | 'out' | 'in' | 'restart';

export interface SafetyCarInfo {
  readonly phase: SafetyCarPhase;
  /** Tick it was called. */
  readonly since: number;
  /** Its last lap: lights out, "SAFETY CAR IN THIS LAP". */
  readonly inThisLap: boolean;
  /** At the restart, the cars past the control line since it went in: free to overtake again. */
  readonly released: readonly CarId[];
}

/** An overtake under the safety car: `attacker` must let `victim` by again before tick `until`. */
export interface GiveBack {
  readonly attacker: CarId;
  readonly victim: CarId;
  readonly until: number;
}

/** A time penalty given in the race. */
export interface RaceIncident {
  readonly tick: number;
  readonly id: CarId;
  /** `overtake`: under the safety car, not given back; `delta`: faster than the delta. */
  readonly reason: 'overtake' | 'delta';
}

/** How the safety car drives, and the delta's speed. */
export interface SafetyCarPlans {
  /** Its lap: the racing line at its pace. */
  readonly race: BotPlan;
  /** Into the pit lane at the end of it (null: a track without one). */
  readonly pit: BotPlan | null;
  /** The delta's speed at each main-loop sample (m/s). */
  readonly delta: readonly number[];
}

const plansCache = new WeakMap<Track, Map<string, SafetyCarPlans>>();

/**
 * The safety car's plans and the delta on `track` (built with its pit lane; `wet` on a wet track),
 * from a bot's racing line: built once per track and weather.
 */
export function safetyCarPlans(
  track: Track,
  wet?: WetParams,
  p: SafetyCarParams = SAFETY_CAR_PARAMS,
): SafetyCarPlans {
  const key = wet ? 'wet' : 'dry';
  const cached = plansCache.get(track)?.get(key);
  if (cached) return cached;
  const level = BOT_PARAMS.medium; // never a shortcut
  const base = buildBotPlan(track, CAR_PARAMS, level, SLOPE_PARAMS, wet);
  const slow = (plan: BotPlan): BotPlan => ({
    ...plan,
    speed: plan.speed.map((v) => Math.min(v * p.pace, p.maxSpeed)),
  });
  const hasPit = track.routes.some((route) => route.pit);
  const plans: SafetyCarPlans = {
    race: slow(base),
    pit: hasPit
      ? slow(buildPitPlan(track, CAR_PARAMS, level, 0, PIT_PARAMS, SLOPE_PARAMS, wet))
      : null,
    delta: base.speed.map((v) => v * p.deltaPace),
  };
  if (!plansCache.has(track)) plansCache.set(track, new Map());
  plansCache.get(track)!.set(key, plans);
  return plans;
}

/**
 * `inputs` with the safety car's own (when it is on the track): its racing line at its pace, into
 * the pit lane once `in`. It never passes and ignores the traffic. Pure: the server, single
 * player's room and the online prediction all drive it alike.
 */
export function withSafetyCar(
  inputs: InputMap,
  state: GameState,
  sc: SafetyCarInfo | null,
  track: Track,
  wet?: WetParams,
): InputMap {
  const car = findCar(state, SAFETY_CAR_ID);
  if (!sc || !car) return inputs;
  const plans = safetyCarPlans(track, wet);
  return { ...inputs, [SAFETY_CAR_ID]: safetyCarInput(car, sc, plans, track) };
}

function safetyCarInput(
  car: CarState,
  sc: SafetyCarInfo,
  plans: SafetyCarPlans,
  track: Track,
): InputCommand {
  // Called: waiting at the pit exit for the leader, held on the brakes.
  if (sc.phase === 'deployed') return { ...NEUTRAL_INPUT, brake: 1 };
  // Going in, or still in the pit lane coming out of it: the pit lane's own road. The race plan's
  // samples are the main loop's: driven from the lane it aimed at the wrong samples (fixed
  // 2026-11-24: it turned round at the pit exit and drove back into the lane).
  const inLane = plans.pit !== null && (sc.phase === 'in' || pitLanePlace(track, car.position));
  return botInput(car, inLane ? plans.pit! : plans.race, NEW_BOT_MEMORY).input;
}

/** Where a car is, as the safety car's rules see it. */
interface Spot {
  /** Main-loop progress (m from the line) and its sample. */
  readonly progress: number;
  readonly index: number;
  /** In the pit lane: out of the delta and of the order on track. */
  readonly inPit: boolean;
  readonly speed: number;
  /** A tyre flat: it may be overtaken. */
  readonly flat: boolean;
}

function spotOf(track: Track, car: CarState): Spot {
  const main = locateOnLoop(track, car.position);
  return {
    progress: main.distance,
    index: main.index,
    inPit: pitLanePlace(track, car.position) !== null,
    speed: length(car.velocity),
    flat: car.damage ? isPunctured(puncturedTyres(car.damage, car.tyres, DAMAGE_PARAMS)) : false,
  };
}

/** `metres` wrapped into (−length/2, length/2]: the shorter way round the lap. */
function signedGap(metres: number, lapLength: number): number {
  const m = ((metres % lapLength) + lapLength) % lapLength;
  return m > lapLength / 2 ? m - lapLength : m;
}

/** `metres` wrapped into [0, length): how far ahead along the lap. */
function aheadGap(metres: number, lapLength: number): number {
  return ((metres % lapLength) + lapLength) % lapLength;
}

/**
 * Each car's delta (s, + = slower than the reference: fine) while the safety car waits for the
 * leader (`deployed`; owner, 2026-11-25: once it has left with the leader, none): from
 * `deltaStart`, the time it took over each stretch less the time the delta's speed allows there.
 * Not counted in the pit lane. Beating it (under `−deltaTolerance`) starts `deltaGrace` seconds to
 * get back above it. Used by the race rules (penalties) and by each player's HUD.
 */
export class SafetyCarDelta {
  private readonly deltas = new Map<CarId, number>();
  private readonly last = new Map<CarId, number>();
  /** Each car beating its delta: the tick it went under. */
  private readonly underSince = new Map<CarId, number>();
  private since: number | null = null;
  private readonly p: SafetyCarParams;

  constructor(p: SafetyCarParams = SAFETY_CAR_PARAMS) {
    this.p = p;
  }

  /**
   * After `ticks` ticks (a player's HUD may skip some between frames) reaching `state` under `sc`
   * (cleared when there is no delta).
   */
  update(
    state: GameState,
    sc: SafetyCarInfo | null,
    track: Track,
    plans: SafetyCarPlans,
    ticks = 1,
  ): void {
    if (!sc || !deltaOn(sc)) {
      this.clear();
      return;
    }
    this.follow(sc.since);
    for (const car of state.cars) {
      if (car.id === SAFETY_CAR_ID) continue;
      this.step(car.id, spotOf(track, car), track, plans, state.tick, ticks);
    }
  }

  /** The delta of the period called at tick `since`: a new one if it is not this one's. */
  follow(since: number): void {
    if (this.since === since) return;
    this.clear();
    this.since = since;
  }

  /** One car's step to `spot` at `tick` (the race rules pass the spots they already have). */
  step(id: CarId, spot: Spot, track: Track, plans: SafetyCarPlans, tick: number, ticks = 1): void {
    const before = this.last.get(id);
    this.last.set(id, spot.progress);
    let delta = this.deltas.get(id) ?? this.p.deltaStart;
    if (before !== undefined && !spot.inPit) {
      const moved = aheadGap(spot.progress - before, track.length);
      // A teleport (a reset) or rolling back: not driving.
      if (moved <= 100 * ticks) {
        const allowed = plans.delta[spot.index] ?? Infinity;
        delta += ticks * FIXED_DT - moved / allowed;
      }
    }
    this.deltas.set(id, delta);
    if (delta >= -this.p.deltaTolerance) this.underSince.delete(id);
    else if (!this.underSince.has(id)) this.underSince.set(id, tick);
  }

  /** `id`'s delta now (s); null without one (no safety car, or not yet counted). */
  get(id: CarId): number | null {
    return this.since === null ? null : (this.deltas.get(id) ?? null);
  }

  /**
   * Beating its delta at `tick`: the seconds `id` has left to get back above it (≤ 0: the penalty
   * is due); null when it is not beating it.
   */
  graceLeft(id: CarId, tick: number): number | null {
    const under = this.since === null ? undefined : this.underSince.get(id);
    return under === undefined ? null : this.p.deltaGrace - (tick - under) / TICK_RATE;
  }

  clear(): void {
    this.deltas.clear();
    this.last.clear();
    this.underSince.clear();
    this.since = null;
  }
}

/** What the race rules need from the room for the safety car. */
export interface SafetyCarRoom {
  readonly track: Track;
  readonly state: GameState;
  safetyCar: SafetyCarInfo | null;
  /** The safety car at `position` facing `direction` (unit) at `speed` (m/s). */
  placeSafetyCar(position: Vec2, direction: Vec2, speed: number): void;
  retire(id: CarId): void;
}

/** From this wetness on, the safety car drives (and the delta is reckoned) as on a wet track. */
const SAFETY_CAR_WET_FROM = 0.5;

/**
 * The wet params the safety car runs with on a track `wetness` wet (2.8): the rain's from
 * `SAFETY_CAR_WET_FROM` on, else none (dry). The server and every prediction pick the same.
 */
export function safetyCarWet(wetness: number): WetParams | undefined {
  return wetness >= SAFETY_CAR_WET_FROM ? WET_PARAMS : undefined;
}

/** The race as the safety car's rules see it after a tick. */
export interface SafetyCarRace {
  /** The cars still racing, in race order (the leader first). */
  readonly running: readonly CarId[];
  readonly raceLaps: number;
  /** Lights out: no safety car before it. */
  readonly started: boolean;
  readonly wet?: WetParams;
}

/**
 * Runs the safety car in a race (`GrandPrix`): calls it after a hard crash, sends it out ahead of
 * the leader, brings it in after its lap, ends the restart; keeps everyone's delta and watches
 * every overtake while it lasts. Gives the time penalties; the Grand Prix adds them to the drivers.
 * Pure apart from its room.
 */
export class SafetyCarDirector {
  /** The period now; null: none. */
  info: SafetyCarInfo | null = null;
  /** Overtakes still to be given back. */
  giveBack: GiveBack[] = [];
  /** Every penalty of the race. */
  incidents: RaceIncident[] = [];

  private readonly delta: SafetyCarDelta;
  /** Each car's spot at the end of the last tick (the overtakes are read between two ticks). */
  private spots = new Map<CarId, Spot>();
  /** How far the safety car has driven since it came out (m). */
  private travelled = 0;
  private phaseSince = 0;
  /**
   * Each car's laps when the safety car went in: one more and it is released at the restart; the
   * leader's one more is the green flag.
   */
  private lapsAtIn = new Map<CarId, number>();
  /** Cars already penalised for the delta in this period. */
  private deltaPenalised = new Set<CarId>();

  private readonly p: SafetyCarParams;

  constructor(p: SafetyCarParams = SAFETY_CAR_PARAMS) {
    this.p = p;
    this.delta = new SafetyCarDelta(p);
  }

  /** A car's delta now (s); null without one. */
  deltaOf(id: CarId): number | null {
    return this.delta.get(id);
  }

  /** The race is over (or a new one begins): no safety car, its car off the track, all forgotten. */
  reset(room: SafetyCarRoom): void {
    if (findCar(room.state, SAFETY_CAR_ID)) room.retire(SAFETY_CAR_ID);
    this.info = null;
    room.safetyCar = null;
    this.giveBack = [];
    this.incidents = [];
    this.spots.clear();
    this.delta.clear();
    this.lapsAtIn.clear();
    this.deltaPenalised.clear();
  }

  /** After each race tick: whether anything a player sees changed (phase, give backs, penalties). */
  tick(room: SafetyCarRoom, race: SafetyCarRace): boolean {
    const { state, track } = room;
    let changed = false;
    if (this.mayDeploy() && race.started && this.shouldDeploy(state, race)) {
      this.deploy(room);
      changed = true;
    }
    // Nothing to watch: no safety car, nothing owed.
    if (!this.info && this.giveBack.length === 0) {
      this.spots.clear();
      return changed;
    }
    const spots = new Map<CarId, Spot>();
    for (const car of state.cars) spots.set(car.id, spotOf(track, car));
    if (this.info) {
      const plans = safetyCarPlans(track, race.wet, this.p);
      changed = this.advance(room, race, spots, plans) || changed;
      if (this.info && deltaOn(this.info)) {
        this.delta.follow(this.info.since);
        for (const id of race.running) {
          const spot = spots.get(id);
          if (spot) this.delta.step(id, spot, track, plans, state.tick);
        }
        changed = this.deltaPenalties(state.tick, race) || changed;
      } else {
        this.delta.clear();
      }
      if (this.info) changed = this.watchOvertakes(state, track, race, spots) || changed;
    }
    changed = this.expireGiveBacks(state.tick, spots) || changed;
    this.spots = spots;
    return changed;
  }

  /** No period now, or the safety car on its way in: a crash calls it (again). */
  private mayDeploy(): boolean {
    const info = this.info;
    return !info || info.phase === 'in' || info.phase === 'restart' || info.inThisLap;
  }

  /**
   * Called: a new period, everyone under a new delta. Still on the track, it stays out for a whole
   * lap more; in the pit lane or gone, it comes out of the pit exit at once (its car in the lane
   * taken off, placed there again: the lane is too slow to drive back up it ahead of the leader).
   */
  private deploy(room: SafetyCarRoom): void {
    const { state, track } = room;
    const car = findCar(state, SAFETY_CAR_ID);
    const onTrack = car !== undefined && pitLanePlace(track, car.position) === null;
    if (car && !onTrack) room.retire(SAFETY_CAR_ID);
    this.travelled = 0;
    this.setPhase(room, {
      phase: onTrack ? 'out' : 'deployed',
      since: state.tick,
      inThisLap: false,
      released: [],
    });
    this.delta.follow(state.tick);
    this.deltaPenalised.clear();
  }

  /** A hard wall hit by a car still racing, in a long race, before its last lap. */
  private shouldDeploy(state: GameState, race: SafetyCarRace): boolean {
    if (race.raceLaps <= this.p.minRaceLaps) return false;
    const leader = race.running[0];
    const leaderLaps = leader ? (findLap(state, leader)?.laps ?? 0) : 0;
    if (leaderLaps >= race.raceLaps - 1) return false;
    return state.impacts.some(
      (impact) =>
        impact.other === 'wall' &&
        impact.strength >= this.p.impactStrength &&
        race.running.includes(impact.carId),
    );
  }

  /** Moves the period on through its phases; whether it changed. */
  private advance(
    room: SafetyCarRoom,
    race: SafetyCarRace,
    spots: ReadonlyMap<CarId, Spot>,
    plans: SafetyCarPlans,
  ): boolean {
    const info = this.info!;
    const { state, track } = room;
    const pitRoute = track.routes.find((route) => route.pit)?.branch;
    switch (info.phase) {
      case 'deployed': {
        const leader = race.running.map((id) => spots.get(id)).find((s) => s && !s.inPit);
        const waiting = spots.get(SAFETY_CAR_ID);
        if (!findCar(state, SAFETY_CAR_ID)) {
          // Called: straight to the end of the pit lane, to wait there still for the leader.
          const exit = pitExitSpot(track);
          if (!exit) {
            // A track without a pit lane: out at once, ahead of the leader.
            if (!leader) return false;
            const at = leader.progress + 150;
            const sample = track.samples[sampleAt(track, at)]!;
            room.placeSafetyCar(
              sample.position,
              sample.tangent,
              plans.race.speed[sampleAt(track, at)] ?? 30,
            );
            return this.release(room, info);
          }
          const blocked = state.cars.some(
            (car) => distance(car.position, exit.position) < this.p.spawnClearance,
          );
          if (!blocked) room.placeSafetyCar(exit.position, exit.direction, 0);
          return false;
        }
        // Waiting: it goes once it has the leader right behind it.
        if (!leader || !waiting) return false;
        const behind = aheadGap(waiting.progress - leader.progress, track.length);
        if (behind > this.p.releaseBehind) return false;
        return this.release(room, info);
      }
      case 'out': {
        const now = spots.get(SAFETY_CAR_ID);
        const before = this.spots.get(SAFETY_CAR_ID);
        if (!now) return this.goIn(room, 'restart');
        if (before) {
          // Only forward: a step back (merging from the pit lane) is not a lap driven.
          const step = signedGap(now.progress - before.progress, track.length);
          this.travelled += Math.max(0, Math.min(100, step));
        }
        let changed = false;
        if (!info.inThisLap && this.travelled > track.length * this.p.inThisLap) {
          this.setPhase(room, { ...info, inThisLap: true });
          changed = true;
        }
        const lapDone = this.travelled > track.length * 0.6;
        if (pitRoute && lapDone) {
          const toEntry = aheadGap(pitRoute.mainFrom - now.progress, track.length);
          if (toEntry <= this.p.enterFrom && toEntry >= this.p.enterTo)
            return this.goIn(room, 'in');
        }
        // No pit lane, or the entry missed: it leaves the track after its lap.
        if (this.travelled > track.length * (pitRoute ? 1.2 : 1)) return this.goIn(room, 'restart');
        return changed;
      }
      case 'in': {
        if (this.greenFlag(room, race)) return true;
        const car = findCar(state, SAFETY_CAR_ID);
        const place = car && pitLanePlace(track, car.position);
        const stuck = state.tick - this.phaseSince > 30 * TICK_RATE;
        if (!car || inLimit(place ?? null) || stuck) return this.toRestart(room);
        return false;
      }
      case 'restart': {
        if (this.greenFlag(room, race)) return true;
        const released = race.running.filter(
          (id) =>
            info.released.includes(id) ||
            (findLap(state, id)?.laps ?? 0) > (this.lapsAtIn.get(id) ?? Infinity),
        );
        const everyone = race.running.every((id) => released.includes(id) || !spots.has(id));
        if (everyone) {
          this.setPhase(room, null);
          return true;
        }
        if (released.length === info.released.length) return false;
        this.setPhase(room, { ...info, released });
        return true;
      }
    }
  }

  /** It leads the field from here: one lap. */
  private release(room: SafetyCarRoom, info: SafetyCarInfo): boolean {
    this.travelled = 0;
    this.setPhase(room, { ...info, phase: 'out' });
    return true;
  }

  /** Its lap done: each car's laps noted (the restart's line), then into the pit lane or gone. */
  private goIn(room: SafetyCarRoom, phase: 'in' | 'restart'): boolean {
    this.lapsAtIn = new Map(room.state.laps.map((lap) => [lap.carId, lap.laps]));
    if (phase === 'restart') return this.toRestart(room);
    this.setPhase(room, { ...this.info!, phase: 'in', inThisLap: true });
    return true;
  }

  /** It has gone in: its car off the track, no overtaking until each car's next line. */
  private toRestart(room: SafetyCarRoom): boolean {
    if (findCar(room.state, SAFETY_CAR_ID)) room.retire(SAFETY_CAR_ID);
    this.setPhase(room, { ...this.info!, phase: 'restart', inThisLap: true, released: [] });
    return true;
  }

  /**
   * The leader across the control line since the safety car went in, with its car in the pit lane
   * or gone: green flag, the period over (its car, if still in the lane, off the track).
   */
  private greenFlag(room: SafetyCarRoom, race: SafetyCarRace): boolean {
    const { state, track } = room;
    const leader = race.running[0];
    if (!leader) return false;
    const laps = findLap(state, leader)?.laps ?? 0;
    if (laps <= (this.lapsAtIn.get(leader) ?? Infinity)) return false;
    const car = findCar(state, SAFETY_CAR_ID);
    if (car && !pitLanePlace(track, car.position)) return false;
    if (car) room.retire(SAFETY_CAR_ID);
    this.setPhase(room, null);
    return true;
  }

  private setPhase(room: SafetyCarRoom, info: SafetyCarInfo | null): void {
    if (info?.phase !== this.info?.phase) this.phaseSince = room.state.tick;
    this.info = info;
    room.safetyCar = info;
  }

  /**
   * A car under its delta by more than the tolerance for `deltaGrace` seconds: a penalty, once per
   * period (back above it sooner, or the delta over, none).
   */
  private deltaPenalties(tick: number, race: SafetyCarRace): boolean {
    let changed = false;
    for (const id of race.running) {
      const left = this.delta.graceLeft(id, tick);
      if (left === null || left > 0 || this.deltaPenalised.has(id)) continue;
      this.deltaPenalised.add(id);
      this.incidents.push({ tick, id, reason: 'delta' });
      changed = true;
    }
    return changed;
  }

  /**
   * Every pair of cars on the track (the safety car too) whose order swapped since the last tick,
   * side by side: an overtake. Allowed past a crawling or punctured car, a car in the pit lane, and
   * at the restart once released; given back (the victim by again), it is forgotten; else it is
   * to be given back.
   */
  private watchOvertakes(
    state: GameState,
    track: Track,
    race: SafetyCarRace,
    spots: ReadonlyMap<CarId, Spot>,
  ): boolean {
    const ids = [...race.running, SAFETY_CAR_ID].filter((id) => spots.has(id));
    let changed = false;
    for (const attacker of race.running) {
      if (this.info!.released.includes(attacker)) continue;
      const a = spots.get(attacker);
      const a0 = this.spots.get(attacker);
      if (!a || !a0 || a.inPit || a0.inPit) continue;
      for (const victim of ids) {
        if (victim === attacker) continue;
        const b = spots.get(victim)!;
        const b0 = this.spots.get(victim);
        if (!b0 || b.inPit || b0.inPit) continue;
        const was = signedGap(b0.progress - a0.progress, track.length);
        const now = signedGap(b.progress - a.progress, track.length);
        if (!(was > 0 && was <= this.p.passWindow && now < 0 && now >= -this.p.passWindow)) {
          continue;
        }
        changed = this.overtake(attacker, victim, b, state.tick) || changed;
      }
    }
    return changed;
  }

  private overtake(attacker: CarId, victim: CarId, victimSpot: Spot, tick: number): boolean {
    // Given back: the car it passed comes by again.
    const owed = this.giveBack.findIndex((g) => g.attacker === victim && g.victim === attacker);
    if (owed >= 0) {
      this.giveBack.splice(owed, 1);
      return true;
    }
    if (victimSpot.speed < this.p.slowCar || victimSpot.flat) return false;
    if (this.giveBack.some((g) => g.attacker === attacker && g.victim === victim)) return false;
    this.giveBack.push({
      attacker,
      victim,
      until: tick + Math.round(this.p.giveBackTime * TICK_RATE),
    });
    return true;
  }

  /** Overtakes not given back in time: the penalty. One whose victim went into the pits: void. */
  private expireGiveBacks(tick: number, spots: ReadonlyMap<CarId, Spot>): boolean {
    const before = this.giveBack.length;
    const kept: GiveBack[] = [];
    for (const g of this.giveBack) {
      const victim = spots.get(g.victim);
      if (!victim || victim.inPit) continue;
      if (tick >= g.until) {
        this.incidents.push({ tick, id: g.attacker, reason: 'overtake' });
        continue;
      }
      kept.push(g);
    }
    this.giveBack = kept;
    return kept.length !== before;
  }
}

/** Whether `sc`'s phase has a delta: only while it waits for the leader. */
function deltaOn(sc: SafetyCarInfo): boolean {
  return sc.phase === 'deployed';
}

/** The safety car waits at least this far off the track's asphalt (m from its edge to its centre). */
const PIT_EXIT_CLEARANCE = 3.5;

/**
 * Where the safety car waits for the leader: the farthest point of the pit lane past its limit line
 * still in the lane and clear of the track, facing out. Null without a pit lane.
 */
export function pitExitSpot(track: Track): { position: Vec2; direction: Vec2 } | null {
  const road = track.routes.find((route) => route.pit);
  const branch = road?.branch;
  const rules = road?.pitRules;
  if (!road || !branch || !rules) return null;
  for (let at = branch.to - 5; at > rules.limitTo; at -= 5) {
    const sample = road.samples.reduce((best, s) =>
      Math.abs(s.distance - at) < Math.abs(best.distance - at) ? s : best,
    );
    // In the lane and clear of the track: its body never reaches the racing cars' asphalt.
    const main = locateOnLoop(track, sample.position);
    const clear = Math.abs(main.lateral) - main.halfWidth >= PIT_EXIT_CLEARANCE;
    if (clear && pitLanePlace(track, sample.position)) {
      return { position: sample.position, direction: sample.tangent };
    }
  }
  return null;
}

/** The main loop's sample nearest `progress` m from the line. */
function sampleAt(track: Track, progress: number): number {
  const along = aheadGap(progress, track.length);
  const n = track.samples.length;
  return Math.round((along / track.length) * n) % n;
}
