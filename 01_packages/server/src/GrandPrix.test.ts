import { describe, expect, it } from 'vitest';
import {
  createLapState,
  HELD,
  type CarId,
  type GameState,
  type LapState,
  type StartHold,
  type TrackDefinition,
  type Weather,
} from '@altf1/shared';
import { GrandPrix, type GrandPrixRoom } from './GrandPrix.ts';

/** A room whose lap timing the test writes by hand, recording what the Grand Prix does to it. */
class FakeRoom implements GrandPrixRoom {
  constructor(track = 'São Paulo') {
    this.definition = { name: track } as TrackDefinition;
  }
  readonly definition: TrackDefinition;
  /** The weather, as the Grand Prix last set it. */
  weather: Weather = 'dry';
  setWeather(weather: Weather): void {
    this.weather = weather;
  }
  state: GameState = { tick: 0, cars: [], impacts: [], laps: [] };
  hold: StartHold | null = null;
  restarts: CarId[][] = [];
  retired: CarId[] = [];
  spawned: CarId[] = [];
  /** Whether damage is on, as the Grand Prix last set it. */
  damage = false;
  setDamage(on: boolean): void {
    this.damage = on;
  }
  /** The pit boxes, as the Grand Prix last set them. */
  boxes: Readonly<Record<CarId, number>> = {};
  setPitBoxes(boxes: Readonly<Record<CarId, number>>): void {
    this.boxes = boxes;
  }
  restart(order: readonly CarId[]): void {
    this.restarts.push([...order]);
    this.state = { ...this.state, laps: order.map((id) => createLapState(id, 0)) };
  }
  retire(id: CarId): void {
    this.retired.push(id);
    this.state = { ...this.state, laps: this.state.laps.filter((lap) => lap.carId !== id) };
  }
  spawn(id: CarId): void {
    this.spawned.push(id);
    this.state = { ...this.state, laps: [...this.state.laps, createLapState(id, 0)] };
  }
  /** `id` has done `sectors` of the lap it is on, still `valid` or not (`currentSectors`). */
  sectors(id: CarId, sectors: readonly number[], valid = true): void {
    const timing = (lap: LapState): LapState =>
      lap.carId === id ? { ...lap, currentSectors: sectors, valid } : lap;
    this.state = { ...this.state, laps: this.state.laps.map(timing) };
  }
  /** `id`'s best valid time of each sector so far (`LapState.bestSectors`). */
  bests(id: CarId, sectors: readonly (number | null)[]): void {
    const timing = (lap: LapState): LapState =>
      lap.carId === id ? { ...lap, bestSectors: sectors } : lap;
    this.state = { ...this.state, laps: this.state.laps.map(timing) };
  }
  /** `id` has completed `laps` timed laps, the last one `ticks` long (`valid` or not), at `tick`. */
  lap(id: CarId, laps: number, ticks: number, tick: number, valid = true): void {
    const lastLap = { ticks, sectors: [], valid };
    const timing = (lap: LapState): LapState =>
      lap.carId === id ? { ...lap, laps, lastLap } : lap;
    this.state = { ...this.state, tick, laps: this.state.laps.map(timing) };
  }
  /** `id` is on lap `laps` + 1 in `sector` (0-based), at `tick`; null `laps` = still before the line. */
  line(
    id: CarId,
    laps: number | null,
    sector: number,
    tick: number,
    best: number | null = null,
  ): void {
    const timing = (lap: LapState): LapState =>
      lap.carId !== id
        ? lap
        : laps === null
          ? { ...lap, lapStartTick: null }
          : {
              ...lap,
              lapStartTick: 1,
              laps,
              sector,
              bestLap: best === null ? null : { ticks: best, sectors: [], valid: true },
            };
    this.state = { ...this.state, tick, laps: this.state.laps.map(timing) };
  }
}

function grandPrix(...ids: CarId[]): { gp: GrandPrix; room: FakeRoom } {
  const room = new FakeRoom();
  const gp = new GrandPrix(room, () => 0.5);
  for (const id of ids) gp.add(id, id.toUpperCase());
  return { gp, room };
}

describe('GrandPrix — lobby', () => {
  it('makes the first player in the manager, waiting in the lobby', () => {
    const { gp } = grandPrix('p3', 'p1');
    expect(gp.info).toEqual({
      phase: 'lobby',
      manager: 'p3',
      drivers: ['p3', 'p1'],
      qualifying: [],
      race: [],
      raceLaps: null,
      hold: null,
      boxes: { p1: 1, p3: 0 },
      weather: 'dry',
      sectorBests: [null, null, null],
    });
    expect(gp.isOpen).toBe(true);
  });

  it('starts only on the manager’s command, and only once', () => {
    const { gp } = grandPrix('p1', 'p2');
    expect(gp.command('p2', { action: 'start' })).toBe(false);
    expect(gp.info.phase).toBe('lobby');
    expect(gp.command('p1', { action: 'start' })).toBe(true);
    expect(gp.info.phase).toBe('qualifying');
    expect(gp.isOpen).toBe(false);
    expect(gp.command('p1', { action: 'start' })).toBe(false);
  });

  it('times laps (for the lap records) only in qualifying and in the race', () => {
    const { gp } = grandPrix('p1');
    expect(gp.isTimed).toBe(false);
    gp.command('p1', { action: 'start' });
    expect(gp.isTimed).toBe(true);
    gp.command('p1', { action: 'endQualifying' });
    expect(gp.isTimed).toBe(false);
    gp.command('p1', { action: 'startRace', laps: 4 });
    expect(gp.isTimed).toBe(true);
    gp.command('p1', { action: 'endRace' });
    expect(gp.isTimed).toBe(false);
  });

  it('turns damage on in qualifying and the race only', () => {
    const { gp, room } = grandPrix('p1');
    const damage: boolean[] = [room.damage];
    gp.command('p1', { action: 'start' });
    damage.push(room.damage);
    gp.command('p1', { action: 'endQualifying' });
    damage.push(room.damage);
    gp.command('p1', { action: 'startRace', laps: 4 });
    damage.push(room.damage);
    gp.command('p1', { action: 'endRace' });
    damage.push(room.damage);
    gp.command('p1', { action: 'playAgain' });
    damage.push(room.damage);
    expect(damage).toEqual([false, true, false, true, false, false]);
  });

  it('gives each driver the lowest free pit box, kept until they leave', () => {
    const { gp, room } = grandPrix('p1', 'p2', 'p3');
    expect(room.boxes).toEqual({ p1: 0, p2: 1, p3: 2 });
    gp.remove('p2');
    expect(room.boxes).toEqual({ p1: 0, p3: 2 });
    gp.add('p4', 'P4');
    expect(gp.info.boxes).toEqual({ p1: 0, p3: 2, p4: 1 });
    expect(room.boxes).toEqual(gp.info.boxes);
  });

  it('hands the manager role to whoever has been there longest when the manager leaves', () => {
    const { gp } = grandPrix('p1', 'p2', 'p3');
    gp.remove('p2');
    gp.remove('p1');
    expect(gp.info.manager).toBe('p3');
    expect(gp.command('p3', { action: 'start' })).toBe(true);
  });
});

describe('GrandPrix — qualifying', () => {
  it('puts everyone back on the grid in arrival order with a fresh timing', () => {
    const { gp, room } = grandPrix('p2', 'p1');
    gp.command('p2', { action: 'start' });
    expect(room.restarts).toEqual([['p2', 'p1']]);
    expect(gp.info.qualifying).toEqual([
      { id: 'p2', best: null, setAt: null, laps: 0, done: false },
      { id: 'p1', best: null, setAt: null, laps: 0, done: false },
    ]);
  });

  it('keeps each driver’s best valid lap and takes them off the track after three', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'start' });
    expect(gp.afterTick()).toBe(false); // nothing finished yet
    room.lap('p1', 1, 5400, 6000);
    room.lap('p2', 1, 5600, 6100);
    expect(gp.afterTick()).toBe(true);
    room.lap('p1', 2, 5300, 11300, false); // faster, but voided by a reset
    room.lap('p2', 2, 5350, 11450);
    gp.afterTick();
    expect(gp.info.qualifying.map((e) => [e.id, e.best, e.laps])).toEqual([
      ['p2', 5350, 2],
      ['p1', 5400, 2],
    ]);
    room.lap('p1', 3, 5500, 16800);
    gp.afterTick();
    expect(room.retired).toEqual(['p1']);
    expect(gp.info.qualifying.find((e) => e.id === 'p1')).toMatchObject({ done: true });
    expect(gp.info.phase).toBe('qualifying'); // p2 is still on a lap
  });

  it('forms the grid when the last driver is done: qualifying order, held', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'start' });
    room.lap('p1', 3, 5400, 17000);
    room.lap('p2', 3, 5300, 17100);
    gp.afterTick();
    expect(gp.info).toMatchObject({ phase: 'grid', hold: HELD });
    expect(room.restarts.at(-1)).toEqual(['p2', 'p1']);
  });

  it('lets the manager end qualifying early (no time: back of the grid)', () => {
    const { gp, room } = grandPrix('p1', 'p2', 'p3');
    gp.command('p1', { action: 'start' });
    room.lap('p3', 1, 5500, 6000);
    gp.afterTick();
    expect(gp.command('p2', { action: 'endQualifying' })).toBe(false);
    expect(gp.command('p1', { action: 'endQualifying' })).toBe(true);
    expect(room.restarts.at(-1)).toEqual(['p3', 'p1', 'p2']);
  });

  it('goes to the grid when the last driver still on a lap disconnects', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'start' });
    room.lap('p1', 3, 5400, 17000);
    gp.afterTick();
    gp.remove('p2');
    expect(gp.info.phase).toBe('grid');
    expect(room.restarts.at(-1)).toEqual(['p1']);
  });
});

describe('GrandPrix — start', () => {
  it('starts the race over the chosen laps with the lights from the next second', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'start' });
    gp.command('p1', { action: 'endQualifying' });
    room.state = { ...room.state, tick: 1000 };
    expect(gp.command('p2', { action: 'startRace', laps: 8 })).toBe(false);
    expect(gp.command('p1', { action: 'startRace', laps: 8 })).toBe(true);
    // random 0.5: lights out 0.6 s after the fifth light.
    expect(gp.info).toMatchObject({
      phase: 'race',
      raceLaps: 8,
      hold: { lightsFrom: 1060, until: 1060 + 240 + 36 },
    });
    expect(gp.command('p1', { action: 'startRace', laps: 4 })).toBe(false);
  });
});

/** A Grand Prix with `ids` on the grid in that order (qualifying ended at once), racing `laps`. */
function racing(laps: 4 | 8 | 12, ...ids: CarId[]): { gp: GrandPrix; room: FakeRoom } {
  const { gp, room } = grandPrix(...ids);
  gp.command(ids[0]!, { action: 'start' });
  gp.command(ids[0]!, { action: 'endQualifying' });
  room.state = { ...room.state, tick: 100 };
  gp.command(ids[0]!, { action: 'startRace', laps });
  return { gp, room };
}

describe('GrandPrix — race', () => {
  it('starts with everyone on the grid order and no line passed', () => {
    const { gp } = racing(4, 'p1', 'p2');
    expect(gp.info.race.map((s) => [s.id, s.name, s.status, s.laps])).toEqual([
      ['p1', 'P1', 'running', 0],
      ['p2', 'P2', 'running', 0],
    ]);
  });

  it('times every line and reorders: who passed more lines, then who got there first', () => {
    const { gp, room } = racing(4, 'p1', 'p2');
    room.line('p2', 0, 0, 500); // p2 crosses the start line first
    expect(gp.afterTick()).toBe(true);
    room.line('p1', 0, 0, 503);
    gp.afterTick();
    expect(gp.afterTick()).toBe(false); // nothing new
    expect(gp.info.race.map((s) => [s.id, s.gap])).toEqual([
      ['p2', null],
      ['p1', 3],
    ]);
  });

  it('counts each pit stop once, when it begins, in the race', () => {
    const { gp, room } = racing(4, 'p1', 'p2');
    const car = (id: CarId, until?: number) =>
      ({ id, ...(until !== undefined && { pitStop: { until } }) }) as GameState['cars'][number];
    room.state = { ...room.state, cars: [car('p1', 900), car('p2')] };
    expect(gp.afterTick()).toBe(true);
    expect(gp.afterTick()).toBe(false); // the same stop, still held
    room.state = { ...room.state, cars: [car('p1'), car('p2', 1200)] };
    gp.afterTick();
    room.state = { ...room.state, cars: [car('p1', 3000), car('p2', 1200)] };
    gp.afterTick();
    expect(gp.info.race.map((s) => [s.id, s.stops])).toEqual([
      ['p1', 2],
      ['p2', 1],
    ]);
  });

  it('takes finishers off the track with their race time, and ends when nobody is racing', () => {
    const { gp, room } = racing(4, 'p1', 'p2');
    const until = gp.info.hold!.until;
    room.line('p1', 4, 0, until + 20000, 4900);
    gp.afterTick();
    expect(room.retired).toEqual(['p1']);
    expect(gp.info.race[0]).toMatchObject({
      id: 'p1',
      status: 'finished',
      time: 20000,
      best: 4900,
    });
    expect(gp.info.phase).toBe('race');
    room.line('p2', 4, 0, until + 20300);
    gp.afterTick();
    expect(gp.info.phase).toBe('results');
    expect(gp.info.race.map((s) => [s.id, s.gap])).toEqual([
      ['p1', null],
      ['p2', 300],
    ]);
  });

  it('marks a driver who leaves DNF (kept, at the back, by name)', () => {
    const { gp, room } = racing(4, 'p1', 'p2', 'p3');
    room.line('p2', 0, 0, 500);
    gp.afterTick();
    gp.remove('p2');
    expect(gp.info.race.at(-1)).toMatchObject({ id: 'p2', name: 'P2', status: 'dnf' });
    expect(gp.info.phase).toBe('race');
  });

  it('lets the manager end the race: whoever is still racing is classified where they are', () => {
    const { gp, room } = racing(8, 'p1', 'p2');
    room.line('p2', 1, 1, 9000);
    gp.afterTick();
    expect(gp.command('p2', { action: 'endRace' })).toBe(false);
    expect(gp.command('p1', { action: 'endRace' })).toBe(true);
    expect(gp.info.phase).toBe('results');
    expect(gp.info.race.map((s) => [s.id, s.status, s.laps])).toEqual([
      ['p2', 'running', 1],
      ['p1', 'running', 0],
    ]);
  });
});

describe('GrandPrix — play again', () => {
  function finished(...ids: CarId[]): { gp: GrandPrix; room: FakeRoom } {
    const { gp, room } = racing(4, ...ids);
    gp.command(ids[0]!, { action: 'endRace' });
    return { gp, room };
  }

  it('is ignored before the results', () => {
    const { gp } = racing(4, 'p1', 'p2');
    expect(gp.command('p2', { action: 'playAgain' })).toBe(false);
    expect(gp.info.phase).toBe('race');
  });

  it('starts a new lobby with whoever asks first as its only driver and manager', () => {
    const { gp, room } = finished('p1', 'p2', 'p3');
    room.hold = { lightsFrom: 1, until: 2 };
    expect(gp.isOpen).toBe(false);
    expect(gp.command('p2', { action: 'playAgain' })).toBe(true);
    expect(gp.info).toEqual({
      phase: 'lobby',
      manager: 'p2',
      drivers: ['p2'],
      qualifying: [],
      race: [],
      raceLaps: null,
      hold: null,
      boxes: { p2: 0 },
      weather: 'dry',
      sectorBests: [null, null, null],
    });
    expect(room.restarts.at(-1)).toEqual(['p2']);
    expect(gp.isOpen).toBe(true);
  });

  it('lets the others join that lobby with a car, once each, until it starts', () => {
    const { gp, room } = finished('p1', 'p2', 'p3');
    gp.command('p2', { action: 'playAgain' });
    expect(gp.command('p2', { action: 'playAgain' })).toBe(false);
    expect(gp.command('p3', { action: 'playAgain' })).toBe(true);
    expect(gp.info.drivers).toEqual(['p2', 'p3']);
    expect(room.spawned).toEqual(['p3']);
    gp.command('p2', { action: 'start' });
    expect(gp.command('p1', { action: 'playAgain' })).toBe(false);
    expect(room.restarts.at(-1)).toEqual(['p2', 'p3']);
  });

  it('has no manager when the new lobby empties, until someone else asks', () => {
    const { gp } = finished('p1', 'p2');
    gp.command('p1', { action: 'playAgain' });
    gp.remove('p1');
    expect(gp.info.manager).toBeNull();
    gp.command('p2', { action: 'playAgain' });
    expect(gp.info.manager).toBe('p2');
  });
});

describe('GrandPrix — weather', () => {
  it('is dry until the manager chooses the rain in the lobby, for the room too', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    expect(gp.info.weather).toBe('dry');
    expect(gp.command('p1', { action: 'weather', weather: 'rain' })).toBe(true);
    expect(gp.info.weather).toBe('rain');
    expect(room.weather).toBe('rain');
    expect(gp.command('p1', { action: 'weather', weather: 'dry' })).toBe(true);
    expect(room.weather).toBe('dry');
  });

  it('ignores anyone but the manager, and a choice that changes nothing', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    expect(gp.command('p2', { action: 'weather', weather: 'rain' })).toBe(false);
    expect(gp.command('p1', { action: 'weather', weather: 'dry' })).toBe(false);
    expect(room.weather).toBe('dry');
  });

  it('never rains on a track that does not offer it', () => {
    const room = new FakeRoom('Monza');
    const gp = new GrandPrix(room, () => 0.5);
    gp.add('p1', 'P1');
    expect(gp.command('p1', { action: 'weather', weather: 'rain' })).toBe(false);
    expect(gp.info.weather).toBe('dry');
    expect(room.weather).toBe('dry');
  });

  it('keeps it through qualifying and the race, fixed once the GP has started', () => {
    const { gp, room } = grandPrix('p1');
    gp.command('p1', { action: 'weather', weather: 'rain' });
    gp.command('p1', { action: 'start' });
    expect(gp.command('p1', { action: 'weather', weather: 'dry' })).toBe(false);
    gp.command('p1', { action: 'endQualifying' });
    gp.command('p1', { action: 'startRace', laps: 4 });
    expect(gp.info).toMatchObject({ phase: 'race', weather: 'rain' });
    expect(room.weather).toBe('rain');
  });

  it('keeps it after play again, where the new manager may change it', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'weather', weather: 'rain' });
    gp.command('p1', { action: 'start' });
    gp.command('p1', { action: 'endQualifying' });
    gp.command('p1', { action: 'startRace', laps: 4 });
    gp.command('p1', { action: 'endRace' });
    gp.command('p2', { action: 'playAgain' });
    expect(gp.info).toMatchObject({ phase: 'lobby', manager: 'p2', weather: 'rain' });
    expect(gp.command('p2', { action: 'weather', weather: 'dry' })).toBe(true);
    expect(room.weather).toBe('dry');
  });
});

describe('GrandPrix — session best sectors', () => {
  it('keeps the best of every driver, sector by sector, and tells when one improves', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'start' });
    expect(gp.info.sectorBests).toEqual([null, null, null]);
    room.bests('p1', [1800, 1900, null]);
    room.bests('p2', [1850, 1700, null]);
    expect(gp.afterTick()).toBe(true);
    expect(gp.info.sectorBests).toEqual([1800, 1700, null]);
    expect(gp.afterTick()).toBe(false); // nothing new
    room.bests('p2', [1750, 1700, 2000]);
    expect(gp.afterTick()).toBe(true);
    expect(gp.info.sectorBests).toEqual([1750, 1700, 2000]);
  });

  it('times the lobby too, and starts over with every session', () => {
    const { gp, room } = grandPrix('p1');
    room.restart(['p1']);
    room.bests('p1', [1800, 1900, 2000]);
    expect(gp.afterTick()).toBe(true);
    expect(gp.info.sectorBests).toEqual([1800, 1900, 2000]);
    gp.command('p1', { action: 'start' });
    expect(gp.info.sectorBests).toEqual([null, null, null]);
    room.bests('p1', [1810, 1910, 2010]);
    gp.afterTick();
    expect(gp.info.sectorBests).toEqual([1810, 1910, 2010]);
    gp.command('p1', { action: 'endQualifying' });
    expect(gp.info).toMatchObject({ phase: 'grid', sectorBests: [null, null, null] });
  });

  it('takes each sector as soon as it is done, on a valid lap only', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'start' });
    room.sectors('p1', [1800]);
    expect(gp.afterTick()).toBe(true);
    expect(gp.info.sectorBests).toEqual([1800, null, null]);
    room.sectors('p1', [1800, 1700]);
    expect(gp.afterTick()).toBe(true);
    expect(gp.info.sectorBests).toEqual([1800, 1700, null]);
    room.sectors('p2', [1500], false); // a reset voided p2's lap: not timed
    expect(gp.afterTick()).toBe(false);
    room.sectors('p1', [1800, 1700], false); // voided later: what was taken stays
    gp.afterTick();
    expect(gp.info.sectorBests).toEqual([1800, 1700, null]);
  });

  it('keeps a best after its driver leaves the track', () => {
    const { gp, room } = grandPrix('p1', 'p2');
    gp.command('p1', { action: 'start' });
    room.bests('p2', [1700, 1600, 1500]);
    room.lap('p2', 3, 4800, 9000); // p2's last timed lap: off the track
    gp.afterTick();
    expect(room.retired).toContain('p2');
    expect(gp.afterTick()).toBe(false);
    expect(gp.info.sectorBests).toEqual([1700, 1600, 1500]);
  });
});
