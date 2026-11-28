import { describe, expect, it } from 'vitest';
import { botInput, NEW_BOT_MEMORY, type BotMemory } from '../ai/driver';
import type { BotPlan } from '../ai/plan';
import { SAFETY_CAR_PARAMS as P } from '../config/safetyCar';
import { TICK_RATE } from '../config/sim';
import { onlineSimContext } from '../net/simContext';
import type { InputCommand } from '../types/input';
import { SAFETY_CAR_ID, type CarId, type CarState } from '../sim/car';
import type { ImpactEvent } from '../sim/collision/types';
import { pitLanePlace } from '../sim/pit';
import { locateOnLoop } from '../track/query';
import type { Vec2 } from '../math/vec2';
import {
  createGame,
  placeCarAt,
  placeCarAtPose,
  removeCar,
  stepGame,
  type GameState,
  type InputMap,
  type SimContext,
} from '../sim/game';
import { createLapState } from '../sim/laps';
import { buildTrack } from '../track/buildTrack';
import { GP_TRACKS, MONZA } from '../track/layouts';
import type { Track } from '../track/types';
import {
  pitExitSpot,
  SafetyCarDelta,
  SafetyCarDirector,
  safetyCarPlans,
  withSafetyCar,
  type SafetyCarInfo,
  type SafetyCarPhase,
  type SafetyCarRace,
  type SafetyCarRoom,
} from './safetyCar';

const track = buildTrack(MONZA, { pitLane: true });
const plans = safetyCarPlans(track);

/** A room like the server's: the simulation, the safety car placed, retired and driven. */
class TestRoom implements SafetyCarRoom {
  readonly track: Track = track;
  readonly ctx: SimContext = onlineSimContext(track, { damage: true, pitBoxes: {} });
  safetyCar: SafetyCarInfo | null = null;
  state: GameState;
  constructor(state: GameState) {
    this.state = state;
  }
  placeSafetyCar(position: Vec2, direction: Vec2, speed: number): void {
    this.state = placeCarAtPose(this.state, track, SAFETY_CAR_ID, position, direction, speed);
  }
  retire(id: CarId): void {
    this.state = removeCar(this.state, id);
  }
  step(inputs: InputMap): void {
    this.state = stepGame(
      this.state,
      withSafetyCar(inputs, this.state, this.safetyCar, track),
      this.ctx,
    );
  }
}

const race = (running: readonly CarId[], raceLaps = 12): SafetyCarRace => ({
  running,
  raceLaps,
  started: true,
});

/** A wall hit by `carId` at `strength` m/s in the last tick of `state`. */
const crash = (state: GameState, carId: CarId, strength: number): GameState => {
  const impact: ImpactEvent = {
    carId,
    other: 'wall',
    point: { x: 0, z: 0 },
    normal: { x: 0, z: 1 },
    strength,
  };
  return { ...state, impacts: [impact] };
};

/** `id` on the centreline `progress` m from the line at `speed`, timing from there. */
const carAt = (id: CarId, progress: number, speed: number): CarState => {
  const placed = placeCarAt(createGame(track, []), track, id, progress, speed);
  return placed.cars[0]!;
};

const stateOf = (cars: readonly CarState[], tick = 100): GameState => ({
  tick,
  cars: [...cars].sort((a, b) => (a.id < b.id ? -1 : 1)),
  impacts: [],
  laps: [...cars].sort((a, b) => (a.id < b.id ? -1 : 1)).map((car) => createLapState(car.id, 0)),
});

describe('safety car — called', () => {
  const room = (): TestRoom => new TestRoom(createGame(track, ['p1', 'p2', 'p3']));

  it('comes out after a hard wall hit in a race over 10 laps', () => {
    const r = room();
    const director = new SafetyCarDirector();
    r.state = crash(r.state, 'p2', P.impactStrength + 1);
    expect(director.tick(r, race(['p1', 'p2', 'p3']))).toBe(true);
    expect(director.info).toMatchObject({ phase: 'deployed', inThisLap: false, released: [] });
    expect(r.safetyCar).toBe(director.info);
  });

  it('not for a light hit, a race of 10 laps or less, before lights out, or a car not racing', () => {
    const cases: [GameState, SafetyCarRace][] = [
      [crash(room().state, 'p2', P.impactStrength - 1), race(['p1', 'p2'])],
      [crash(room().state, 'p2', 40), race(['p1', 'p2'], P.minRaceLaps)],
      [crash(room().state, 'p2', 40), { ...race(['p1', 'p2']), started: false }],
      [crash(room().state, 'p3', 40), race(['p1', 'p2'])],
    ];
    for (const [state, r] of cases) {
      const director = new SafetyCarDirector();
      const test = new TestRoom(state);
      director.tick(test, r);
      expect(director.info).toBeNull();
    }
  });

  it('not on the leader’s last lap', () => {
    const r = room();
    const laps = r.state.laps.map((lap) => (lap.carId === 'p1' ? { ...lap, laps: 11 } : lap));
    r.state = crash({ ...r.state, laps }, 'p2', 40);
    const director = new SafetyCarDirector();
    director.tick(r, race(['p1', 'p2', 'p3']));
    expect(director.info).toBeNull();
  });
});

describe('safety car — one lap', () => {
  it(
    'waits for the leader at the pit exit, leads for a lap, lights out, goes in, restart, over',
    { timeout: 60_000 },
    () => {
      const ids = ['p1', 'p2', 'p3'];
      // In single file 40 m apart, rolling at 30 m/s,
      let field = createGame(track, []);
      // Far from the pit exit: the safety car has to wait for them.
      ids.forEach((id, i) => (field = placeCarAt(field, track, id, 2000 - 40 * i, 30)));
      const r = new TestRoom(field);
      const director = new SafetyCarDirector();
      // The field at the safety car's pace: they never catch it, nobody overtakes.
      const pace: BotPlan = plans.race;
      const memory = new Map<CarId, BotMemory>(ids.map((id) => [id, NEW_BOT_MEMORY]));
      const phases: SafetyCarPhase[] = [];
      let lightsOutAt: number | null = null;
      // While called: the most it moved and whether it was always in the pit lane; at its release,
      // how far behind it the leader was (m along the lap).
      let waitingSpeed = 0;
      let waitedInPit = true;
      let waitedTicks = 0;
      let leaderBehind: number | null = null;
      // The tick the leader crossed the line after it went in, and the tick the period ended.
      let leaderLine: number | null = null;
      let endedAt: number | null = null;
      let leaderLaps = 0;
      r.state = crash(r.state, 'p2', 40);
      for (let i = 0; i < 40_000 && (i === 0 || director.info); i++) {
        if (i > 0) {
          const inputs: Record<CarId, InputCommand> = {};
          for (const id of ids) {
            const car = r.state.cars.find((c) => c.id === id)!;
            const result = botInput(car, pace, memory.get(id)!, r.state.cars);
            memory.set(id, result.memory);
            inputs[id] = result.input;
          }
          r.step(inputs);
        }
        const goingIn = director.info?.phase === 'in' || director.info?.phase === 'restart';
        director.tick(r, race(ids, 20));
        const laps = r.state.laps.find((lap) => lap.carId === 'p1')!.laps;
        if (goingIn && laps > leaderLaps && leaderLine === null) leaderLine = r.state.tick;
        leaderLaps = laps;
        if (!director.info && endedAt === null && i > 0) endedAt = r.state.tick;
        const phase = director.info?.phase;
        if (phase && phases.at(-1) !== phase) phases.push(phase);
        const sc = r.state.cars.find((c) => c.id === SAFETY_CAR_ID);
        if (phase === 'deployed' && sc) {
          waitedTicks++;
          waitingSpeed = Math.max(waitingSpeed, Math.hypot(sc.velocity.x, sc.velocity.z));
          if (!pitLanePlace(track, sc.position)) waitedInPit = false;
        }
        if (phase === 'out' && leaderBehind === null && sc) {
          const leader = r.state.cars.find((c) => c.id === 'p1')!;
          const at = (car: { position: Vec2 }): number =>
            locateOnLoop(track, car.position).distance;
          leaderBehind = (((at(sc) - at(leader)) % track.length) + track.length) % track.length;
        }
        if (director.info?.inThisLap && lightsOutAt === null) lightsOutAt = r.state.tick;
      }
      expect(phases).toEqual(['deployed', 'out', 'in', 'restart']);
      expect(director.info).toBeNull();
      // Green flag the moment the leader crosses the line.
      expect(leaderLine).not.toBeNull();
      expect(endedAt).toBe(leaderLine);
      // Out of the pit lane just ahead of the leader, its car gone at the end.
      // It waited still at the pit exit, a long while (the leader was far), and went with the
      // leader right behind it.
      expect(waitedTicks).toBeGreaterThan(10 * TICK_RATE);
      expect(waitingSpeed).toBeLessThan(0.5);
      expect(waitedInPit).toBe(true);
      expect(leaderBehind).not.toBeNull();
      expect(leaderBehind!).toBeLessThanOrEqual(P.releaseBehind + 5);
      expect(lightsOutAt).not.toBeNull();
      expect(r.state.cars.some((c) => c.id === SAFETY_CAR_ID)).toBe(false);
      expect(director.incidents).toEqual([]);
    },
  );
});

describe('safety car — called again while going in', () => {
  const ids = ['p1', 'p2'];
  /** A room with the field on track, the period at `info`, its car at `at` (none: gone). */
  const setup = (
    info: SafetyCarInfo,
    at: 'track' | 'lane' | null,
  ): { r: TestRoom; director: SafetyCarDirector } => {
    let state = createGame(track, []);
    state = placeCarAt(state, track, 'p1', 1000, 30);
    state = placeCarAt(state, track, 'p2', 960, 30);
    if (at === 'track') state = placeCarAt(state, track, SAFETY_CAR_ID, 1100, 25);
    if (at === 'lane') {
      const exit = pitExitSpot(track)!;
      state = placeCarAtPose(state, track, SAFETY_CAR_ID, exit.position, exit.direction, 10);
    }
    const r = new TestRoom(state);
    const director = new SafetyCarDirector();
    director.info = info;
    r.safetyCar = info;
    director.tick(r, race(ids));
    return { r, director };
  };
  const period = (phase: SafetyCarPhase, inThisLap: boolean): SafetyCarInfo => ({
    phase,
    since: 5,
    inThisLap,
    released: [],
  });
  const crashNow = (r: TestRoom, director: SafetyCarDirector): void => {
    r.state = { ...crash(r.state, 'p2', 40), tick: r.state.tick + 1 };
    director.tick(r, race(ids));
  };

  it('on its last lap on the track: out for a whole lap more', () => {
    const { r, director } = setup(period('out', true), 'track');
    crashNow(r, director);
    expect(director.info).toMatchObject({ phase: 'out', inThisLap: false, since: r.state.tick });
  });

  it('in the pit lane: at the pit exit at once, waiting for the leader', () => {
    const { r, director } = setup(period('in', true), 'lane');
    crashNow(r, director);
    expect(director.info).toMatchObject({
      phase: 'deployed',
      inThisLap: false,
      since: r.state.tick,
    });
    const exit = pitExitSpot(track)!;
    const sc = r.state.cars.find((c) => c.id === SAFETY_CAR_ID)!;
    expect(
      Math.hypot(sc.position.x - exit.position.x, sc.position.z - exit.position.z),
    ).toBeLessThan(0.01);
  });

  it('gone, at the restart: out of the pit exit again', () => {
    const { r, director } = setup(period('restart', true), null);
    crashNow(r, director);
    expect(director.info).toMatchObject({ phase: 'deployed', since: r.state.tick });
    expect(r.state.cars.some((c) => c.id === SAFETY_CAR_ID)).toBe(true);
  });

  it('still leading its lap: nothing new', () => {
    const { r, director } = setup(period('out', false), 'track');
    crashNow(r, director);
    expect(director.info).toMatchObject({ phase: 'out', since: 5 });
  });
});

describe('safety car — leaving the pit exit', () => {
  // Driven from the lane on the race plan it turned round and went back in (Singapore) or stayed
  // stuck there (Las Vegas, São Paulo): on every circuit it must drive on, never back.
  it.each(GP_TRACKS.map((def) => [def.name, def] as const))('%s', (_name, def) => {
    const circuit = buildTrack(def, { pitLane: true });
    const exit = pitExitSpot(circuit)!;
    const ctx = onlineSimContext(circuit, { damage: true, pitBoxes: {} });
    const out: SafetyCarInfo = { phase: 'out', since: 0, inThisLap: false, released: [] };
    let state = placeCarAtPose(
      createGame(circuit, []),
      circuit,
      SAFETY_CAR_ID,
      exit.position,
      exit.direction,
      0,
    );
    let prev = locateOnLoop(circuit, exit.position).distance;
    let forward = 0;
    let back = 0;
    for (let i = 0; i < 20 * TICK_RATE; i++) {
      state = stepGame(state, withSafetyCar({}, state, out, circuit), ctx);
      const now = locateOnLoop(circuit, state.cars[0]!.position).distance;
      let step = now - prev;
      if (step > circuit.length / 2) step -= circuit.length;
      if (step < -circuit.length / 2) step += circuit.length;
      if (step > 0) forward += step;
      else back -= step;
      prev = now;
    }
    expect(back).toBeLessThan(1);
    expect(forward).toBeGreaterThan(400);
    expect(pitLanePlace(circuit, state.cars[0]!.position)).toBeNull();
  });
});

describe('safety car — the delta', () => {
  const waiting: SafetyCarInfo = { phase: 'deployed', since: 0, inThisLap: false, released: [] };
  const speedAt = (progress: number): number =>
    plans.delta[Math.round((progress / track.length) * track.samples.length) % plans.delta.length]!;

  it('a car faster than the delta falls under it; one slower than it stays above', () => {
    const delta = new SafetyCarDelta();
    // Two cars down the track: `fast` at the racing line's speed, `slow` at half the delta's.
    let fast = 1000;
    let slow = 1050;
    for (let tick = 1; tick <= 5 * TICK_RATE; tick++) {
      fast += speedAt(fast) / P.deltaPace / TICK_RATE;
      slow += (speedAt(slow) * 0.5) / TICK_RATE;
      delta.update(
        stateOf([carAt('fast', fast, 0), carAt('slow', slow, 0)], tick),
        waiting,
        track,
        plans,
      );
    }
    expect(delta.get('fast')!).toBeLessThan(-P.deltaTolerance);
    expect(delta.get('slow')!).toBeGreaterThan(P.deltaStart);
  });

  it('only while the safety car waits for the leader: none once it has left with it', () => {
    for (const phase of ['out', 'in', 'restart'] as const) {
      const delta = new SafetyCarDelta();
      const sc: SafetyCarInfo = { phase, since: 0, inThisLap: false, released: [] };
      delta.update(stateOf([carAt('a', 1000, 0)]), sc, track, plans);
      expect(delta.get('a')).toBeNull();
    }
  });

  it('beating it starts the grace: seconds left to get back above it, none once back', () => {
    const delta = new SafetyCarDelta();
    let at = 1000;
    let tick = 1;
    // Too fast until it is beating the delta.
    while (delta.graceLeft('a', tick) === null) {
      at += speedAt(at) / P.deltaPace / TICK_RATE;
      delta.update(stateOf([carAt('a', at, 0)], ++tick), waiting, track, plans);
    }
    const under = tick;
    expect(delta.graceLeft('a', under)).toBe(P.deltaGrace);
    expect(delta.graceLeft('a', under + 2 * TICK_RATE)).toBeCloseTo(P.deltaGrace - 2);
    // Stopped: the delta climbs back above the tolerance.
    while (delta.get('a')! < -P.deltaTolerance) {
      delta.update(stateOf([carAt('a', at, 0)], ++tick), waiting, track, plans);
    }
    expect(delta.graceLeft('a', tick)).toBeNull();
  });
});

describe('safety car — the delta penalty', () => {
  /**
   * A director waiting for the leader `a`, which drives too fast (the racing line's speed) for
   * `fastFor` s, then stops; the penalties after `total` s.
   */
  const penalties = (fastFor: number, total: number): number => {
    const director = new SafetyCarDirector();
    const r = new TestRoom(stateOf([carAt('a', 2000, 0)]));
    const waiting: SafetyCarInfo = {
      phase: 'deployed',
      since: 100,
      inThisLap: false,
      released: [],
    };
    director.info = waiting;
    r.safetyCar = waiting;
    let at = 2000;
    for (let t = 1; t <= total * TICK_RATE; t++) {
      if (t <= fastFor * TICK_RATE) {
        at +=
          plans.delta[Math.round((at / track.length) * track.samples.length)]! /
          P.deltaPace /
          TICK_RATE;
      }
      const sc = r.state.cars.find((c) => c.id === SAFETY_CAR_ID);
      r.state = stateOf([carAt('a', at, 0), ...(sc ? [sc] : [])], 100 + t);
      director.tick(r, race(['a']));
    }
    expect(director.info?.phase).toBe('deployed');
    return director.incidents.filter((i) => i.reason === 'delta').length;
  };

  it('back above the delta within the grace: no penalty', () => {
    // Under it after ~2 s, stopped at 4 s: back above it well within 5 s.
    expect(penalties(4, 12)).toBe(0);
  });

  it('beating it for the whole grace: one penalty', () => {
    expect(penalties(12, 12)).toBe(1);
  });
});

describe('safety car — overtakes', () => {
  const sc: SafetyCarInfo = { phase: 'out', since: 0, inThisLap: false, released: [] };
  /** A director already in a period, with `before` read; then `after`. */
  const run = (before: CarState[], after: CarState[], tick = 101): SafetyCarDirector => {
    const director = new SafetyCarDirector();
    const r = new TestRoom(stateOf(before));
    director.info = sc;
    r.safetyCar = sc;
    director.tick(r, race(['a', 'b']));
    r.state = stateOf(after, tick);
    director.tick(r, race(['a', 'b']));
    return director;
  };

  it('an overtake must be given back: in time, forgotten; not, a penalty', () => {
    const director = new SafetyCarDirector();
    const r = new TestRoom(stateOf([carAt('a', 1000, 40), carAt('b', 1010, 40)]));
    director.info = sc;
    r.safetyCar = sc;
    const tick = (a: number, b: number, t: number): void => {
      r.state = stateOf([carAt('a', a, 40), carAt('b', b, 40)], t);
      director.tick(r, race(['a', 'b']));
    };
    tick(1000, 1010, 100);
    tick(1015, 1012, 101); // a by b
    expect(director.giveBack).toMatchObject([{ attacker: 'a', victim: 'b' }]);
    tick(1020, 1025, 102); // b by again: given back
    expect(director.giveBack).toEqual([]);
    tick(1030, 1028, 103); // a by b again, and kept
    expect(director.giveBack).toHaveLength(1);
    tick(1040, 1038, 103 + P.giveBackTime * TICK_RATE);
    expect(director.giveBack).toEqual([]);
    expect(director.incidents).toEqual([
      { tick: 103 + P.giveBackTime * TICK_RATE, id: 'a', reason: 'overtake' },
    ]);
  });

  it('passing a crawling car is no overtake', () => {
    const director = run(
      [carAt('a', 1000, 40), carAt('b', 1010, 5)],
      [carAt('a', 1015, 40), carAt('b', 1011, 5)],
    );
    expect(director.giveBack).toEqual([]);
  });

  it('at the restart, a car past the line is free to overtake', () => {
    const director = new SafetyCarDirector();
    const r = new TestRoom(stateOf([carAt('a', 1000, 40), carAt('b', 1010, 40)]));
    const restart: SafetyCarInfo = { ...sc, phase: 'restart', inThisLap: true, released: ['a'] };
    director.info = restart;
    r.safetyCar = restart;
    director.tick(r, race(['a', 'b']));
    r.state = stateOf([carAt('a', 1015, 40), carAt('b', 1012, 40)], 101);
    director.tick(r, race(['a', 'b']));
    expect(director.giveBack).toEqual([]);
  });

  it('the safety car itself may not be overtaken', () => {
    const director = run(
      [carAt('a', 1000, 40), carAt(SAFETY_CAR_ID, 1010, 40)],
      [carAt('a', 1015, 40), carAt(SAFETY_CAR_ID, 1012, 40)],
    );
    expect(director.giveBack).toMatchObject([{ attacker: 'a', victim: SAFETY_CAR_ID }]);
  });
});
