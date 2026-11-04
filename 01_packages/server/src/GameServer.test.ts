import { describe, expect, it, vi } from 'vitest';
import {
  encodeMessage,
  FIXED_DT,
  findCar,
  GP_TRACKS,
  NEUTRAL_INPUT,
  parseServerMessage,
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY_TICKS,
  type CarId,
  type GameState,
  type OnlineMode,
  type ServerMessage,
} from '@altf1/shared';
import { GameServer, REJECT_CLOSE_CODE, roomKey, type Connection } from './GameServer.ts';
import { finishedLaps, LapRecords } from './LapRecords.ts';
import type { Room } from './Room.ts';

/** A fake socket that records what the server sends. */
class FakeConnection implements Connection {
  readonly received: ServerMessage[] = [];
  closedWith: number | null = null;
  send(text: string): void {
    this.received.push(parseServerMessage(text)!);
  }
  close(code: number): void {
    this.closedWith = code;
  }
  last(type: ServerMessage['type']): ServerMessage | undefined {
    return this.received.filter((m) => m.type === type).at(-1);
  }
  count(type: ServerMessage['type']): number {
    return this.received.filter((m) => m.type === type).length;
  }
}

const hello = (nickname: string, protocol = PROTOCOL_VERSION): string =>
  encodeMessage({ type: 'hello', protocol, nickname });
const enter = (track: string, mode: OnlineMode = 'practice'): string =>
  encodeMessage({ type: 'enter', mode, track });
const input = (throttle: number, seq = 0): string =>
  encodeMessage({ type: 'input', seq, input: { ...NEUTRAL_INPUT, throttle } });

function joined(server: GameServer, nickname: string): FakeConnection {
  const conn = new FakeConnection();
  server.message(conn, hello(nickname));
  return conn;
}

function inRoom(
  server: GameServer,
  nickname: string,
  track: string,
  mode: OnlineMode = 'practice',
): FakeConnection {
  const conn = joined(server, nickname);
  server.message(conn, enter(track, mode));
  return conn;
}

const MONZA_PRACTICE = roomKey('practice', 'Monza', 'p1');

/** One second of real time (four calls: advance never simulates more than 0.25 s at once). */
function oneSecond(server: GameServer): void {
  for (let i = 0; i < 4; i++) server.advance(0.25);
}

describe('GameServer — lobby', () => {
  it('welcomes a player with its id and the rooms of the ready modes, with who is in each', () => {
    const server = new GameServer();
    inRoom(server, 'Kimi', 'Monaco');
    expect(joined(server, 'Enea').received).toEqual([
      {
        type: 'welcome',
        playerId: 'p2',
        rooms: ['practice', 'timeTrial', 'grandPrix'].flatMap((mode) =>
          GP_TRACKS.map(({ name: track }) => ({
            mode,
            track,
            players: mode === 'practice' && track === 'Monaco' ? 1 : 0,
            status: 'open',
          })),
        ),
        records: ['timeTrial', 'grandPrix'].flatMap((mode) =>
          GP_TRACKS.map(({ name: track }) => ({ mode, track, records: [] })),
        ),
      },
    ]);
  });

  it('rejects a taken nickname (any case, in any room) and closes that connection', () => {
    const server = new GameServer();
    inRoom(server, 'Enea', 'Monza');
    const copy = joined(server, 'ENEA');
    expect(copy.received).toEqual([{ type: 'rejected', reason: 'taken' }]);
    expect(copy.closedWith).toBe(REJECT_CLOSE_CODE);
    expect(server.hasJoined(copy)).toBe(false);
  });

  it('rejects an old client and an invalid nickname', () => {
    const server = new GameServer();
    expect(joined(server, 'x').received).toEqual([{ type: 'rejected', reason: 'invalid' }]);
    const old = new FakeConnection();
    server.message(old, hello('Enea', PROTOCOL_VERSION - 1));
    expect(old.received).toEqual([{ type: 'rejected', reason: 'version' }]);
  });

  it('ignores garbage, messages before hello and a second hello', () => {
    const server = new GameServer();
    const conn = new FakeConnection();
    server.message(conn, 'garbage');
    server.message(conn, input(1));
    server.message(conn, enter('Monza'));
    expect(conn.received).toEqual([]);
    expect(server.rooms.size).toBe(0);
    server.message(conn, hello('Enea'));
    server.message(conn, hello('Other'));
    expect(conn.count('welcome')).toBe(1);
    expect(server.lobby.players()).toHaveLength(1);
  });
});

describe('GameServer — rooms', () => {
  it('opens a room when its first player enters and tells the room who is there', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza');
    expect([...server.rooms.keys()]).toEqual([MONZA_PRACTICE]);
    expect(enea.last('entered')).toEqual({
      type: 'entered',
      track: 'Monza',
      players: [{ id: 'p1', nickname: 'Enea', livery: 0 }],
    });
    const kimi = inRoom(server, 'Kimi', 'Monza');
    expect(kimi.last('entered')).toMatchObject({ players: [{ id: 'p1' }, { id: 'p2' }] });
    expect(enea.last('players')).toMatchObject({ players: [{ id: 'p1' }, { id: 'p2' }] });
    expect(kimi.count('players')).toBe(0); // `entered` already lists everyone
    expect(server.rooms.get(MONZA_PRACTICE)!.state.cars.map((c) => c.id)).toEqual(['p1', 'p2']);
  });

  it('keeps the rooms apart: players, cars and snapshots', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza');
    const kimi = inRoom(server, 'Kimi', 'Monaco');
    expect(enea.count('players')).toBe(0); // Kimi went to another room
    expect(kimi.last('entered')).toMatchObject({ players: [{ nickname: 'Kimi' }] });
    oneSecond(server);
    const seen = (conn: FakeConnection): string[] => {
      const snapshot = conn.last('snapshot');
      return snapshot?.type === 'snapshot' ? snapshot.state.cars.map((c) => c.id) : [];
    };
    expect(seen(enea)).toEqual(['p1']);
    expect(seen(kimi)).toEqual(['p2']);
  });

  it('ignores an unknown track, a second enter and inputs before entering', () => {
    const server = new GameServer();
    const enea = joined(server, 'Enea');
    server.message(enea, input(1));
    server.message(enea, enter('Test Ring'));
    expect(enea.count('entered')).toBe(0);
    expect(server.rooms.size).toBe(0);
    server.message(enea, enter('Monza'));
    server.message(enea, enter('Monaco'));
    expect(enea.count('entered')).toBe(1);
    expect([...server.rooms.keys()]).toEqual([MONZA_PRACTICE]);
  });

  it('frees the nickname, removes the car and closes the room when its last player leaves', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza');
    const kimi = inRoom(server, 'Kimi', 'Monza');
    server.close(enea);
    expect(kimi.last('players')).toEqual({
      type: 'players',
      players: [{ id: 'p2', nickname: 'Kimi', livery: 1 }],
    });
    expect(server.rooms.get(MONZA_PRACTICE)!.state.cars.map((c) => c.id)).toEqual(['p2']);
    server.close(kimi);
    expect(server.rooms.size).toBe(0);
    expect(joined(server, 'enea').received[0]).toMatchObject({ type: 'welcome', playerId: 'p3' });
    server.close(new FakeConnection()); // a socket that never joined: nothing happens
  });

  it('gives every time-trial player a private room, counted together per circuit', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza', 'timeTrial');
    const kimi = inRoom(server, 'Kimi', 'Monza', 'timeTrial');
    inRoom(server, 'Lewis', 'Monza'); // practice: another room again
    expect([...server.rooms.keys()]).toEqual([
      roomKey('timeTrial', 'Monza', 'p1'),
      roomKey('timeTrial', 'Monza', 'p2'),
      MONZA_PRACTICE,
    ]);
    expect(kimi.last('entered')).toMatchObject({ players: [{ nickname: 'Kimi' }] });
    expect(enea.count('players')).toBe(0); // nobody joins a private room
    oneSecond(server);
    const snapshot = kimi.last('snapshot');
    expect(snapshot?.type === 'snapshot' && snapshot.state.cars.map((c) => c.id)).toEqual(['p2']);
    expect(joined(server, 'Max').last('welcome')).toMatchObject({
      rooms: expect.arrayContaining([
        { mode: 'timeTrial', track: 'Monza', players: 2, status: 'open' },
      ]),
    });
    server.close(enea);
    expect(server.rooms.has(roomKey('timeTrial', 'Monza', 'p1'))).toBe(false);
  });

  it('simulates each live room at 60 Hz with a snapshot every other tick', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Barcelona');
    const waiting = joined(server, 'Kimi'); // joined, no room yet: no snapshots
    server.message(enea, input(1));
    oneSecond(server);
    expect(server.rooms.get(roomKey('practice', 'Barcelona', 'p1'))!.state.tick).toBe(60);
    expect(enea.count('snapshot')).toBe(60 / SNAPSHOT_EVERY_TICKS);
    expect(waiting.count('snapshot')).toBe(0);
    const snapshot = enea.last('snapshot');
    if (snapshot?.type !== 'snapshot') throw new Error('no snapshot');
    const car = snapshot.state.cars[0]!;
    expect(Math.hypot(car.velocity.x, car.velocity.z)).toBeGreaterThan(10); // Enea's throttle
    expect(snapshot.acks).toEqual({ [car.id]: 0 }); // the one input sent, run on the first tick
    expect(snapshot.inputs).toEqual({ [car.id]: { ...NEUTRAL_INPUT, throttle: 1 } }); // repeated
  });

  it('answers a ping with a pong, only once joined', () => {
    const server = new GameServer();
    const stranger = new FakeConnection();
    server.message(stranger, encodeMessage({ type: 'ping', t: 5 }));
    expect(stranger.received).toEqual([]);
    const enea = joined(server, 'Enea');
    server.message(enea, encodeMessage({ type: 'ping', t: 5 }));
    expect(enea.last('pong')).toEqual({ type: 'pong', t: 5 });
  });

  it('keeps fractional time for the next call and never catches up more than 0.25 s', () => {
    const server = new GameServer();
    inRoom(server, 'Enea', 'Monza');
    const room = server.rooms.get(MONZA_PRACTICE)!;
    server.advance(FIXED_DT * 0.6);
    expect(room.state.tick).toBe(0);
    server.advance(FIXED_DT * 0.6);
    expect(room.state.tick).toBe(1);
    server.advance(10);
    expect(room.state.tick).toBe(1 + 15);
  });
});

describe('GameServer — Grand Prix', () => {
  const start = encodeMessage({ type: 'gp', action: 'start' });

  it('makes the first player in the manager and tells everyone in the room', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza', 'grandPrix');
    expect(enea.last('grandPrix')).toMatchObject({ phase: 'lobby', manager: 'p1' });
    const kimi = inRoom(server, 'Kimi', 'Monza', 'grandPrix');
    expect(kimi.last('grandPrix')).toMatchObject({ manager: 'p1' });
    expect(enea.count('grandPrix')).toBe(2);
    inRoom(server, 'Max', 'Monza'); // free practice on Monza: another room, no Grand Prix
    expect(enea.count('grandPrix')).toBe(2);
  });

  it('starts on the manager’s command only, then refuses newcomers', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza', 'grandPrix');
    const kimi = inRoom(server, 'Kimi', 'Monza', 'grandPrix');
    server.message(kimi, start);
    expect(enea.last('grandPrix')).toMatchObject({ phase: 'lobby' });
    server.message(enea, start);
    expect(kimi.last('grandPrix')).toMatchObject({ phase: 'qualifying' });
    const late = joined(server, 'Lewis');
    expect(late.last('welcome')).toMatchObject({
      rooms: expect.arrayContaining([
        { mode: 'grandPrix', track: 'Monza', players: 2, status: 'running' },
        { mode: 'grandPrix', track: 'Monaco', players: 0, status: 'open' },
      ]),
    });
    server.message(late, enter('Monza', 'grandPrix'));
    expect(late.received.at(-1)).toEqual({ type: 'refused', reason: 'inProgress' });
    expect(server.rooms.get(roomKey('grandPrix', 'Monza', 'p3'))!.has('p3')).toBe(false);
    server.message(late, enter('Monaco', 'grandPrix')); // still free to go elsewhere
    expect(late.last('entered')).toMatchObject({ track: 'Monaco' });
  });

  it('hands the manager role on when the manager leaves, and resets with the room', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza', 'grandPrix');
    const kimi = inRoom(server, 'Kimi', 'Monza', 'grandPrix');
    server.message(enea, start);
    server.close(enea);
    expect(kimi.last('grandPrix')).toMatchObject({ phase: 'qualifying', manager: 'p2' });
    server.close(kimi);
    const next = inRoom(server, 'Lewis', 'Monza', 'grandPrix');
    expect(next.last('grandPrix')).toMatchObject({ phase: 'lobby', manager: 'p3' });
  });

  it('runs qualifying on the grid, then holds the grid until the manager starts the race', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza', 'grandPrix');
    const kimi = inRoom(server, 'Kimi', 'Monza', 'grandPrix');
    const room = server.rooms.get(roomKey('grandPrix', 'Monza', 'p1'))!;
    server.message(kimi, input(1));
    oneSecond(server); // lobby: free driving
    server.message(enea, start);
    expect(room.state.cars.every((car) => car.velocity.x === 0 && car.velocity.z === 0)).toBe(true);
    server.message(enea, encodeMessage({ type: 'gp', action: 'endQualifying' }));
    expect(kimi.last('grandPrix')).toMatchObject({ phase: 'grid', hold: { lightsFrom: null } });
    server.message(kimi, input(1, 1));
    oneSecond(server);
    const held = findCar(room.state, 'p2')!.velocity;
    expect(Math.hypot(held.x, held.z)).toBe(0); // held on the grid
    server.message(enea, encodeMessage({ type: 'gp', action: 'startRace', laps: 4 }));
    expect(kimi.last('grandPrix')).toMatchObject({ phase: 'race', raceLaps: 4 });
  });

  it('opens a new lobby on play again: newcomers welcome, players still on the card not in it', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Monza', 'grandPrix');
    const kimi = inRoom(server, 'Kimi', 'Monza', 'grandPrix');
    const room = server.rooms.get(roomKey('grandPrix', 'Monza', 'p1'))!;
    const gp = (action: 'endQualifying' | 'endRace' | 'playAgain'): string =>
      encodeMessage({ type: 'gp', action });
    server.message(enea, start);
    server.message(enea, gp('endQualifying'));
    server.message(enea, encodeMessage({ type: 'gp', action: 'startRace', laps: 4 }));
    server.message(enea, gp('endRace'));
    expect(kimi.last('grandPrix')).toMatchObject({ phase: 'results' });
    server.message(joined(server, 'Max'), enter('Monza', 'grandPrix'));
    expect(server.rooms.get(roomKey('grandPrix', 'Monza', 'p1'))!.has('p3')).toBe(false);
    server.message(kimi, gp('playAgain'));
    expect(enea.last('grandPrix')).toMatchObject({
      phase: 'lobby',
      manager: 'p2',
      drivers: ['p2'],
    });
    expect(room.state.cars.map((car) => car.id)).toEqual(['p2']);
    const lewis = inRoom(server, 'Lewis', 'Monza', 'grandPrix');
    expect(lewis.last('grandPrix')).toMatchObject({ drivers: ['p2', 'p4'] });
    server.message(enea, gp('playAgain'));
    expect(lewis.last('grandPrix')).toMatchObject({ drivers: ['p2', 'p4', 'p1'] });
    expect(room.state.cars.map((car) => car.id)).toEqual(['p1', 'p2', 'p4']);
  });
});

/** Makes `room`'s next tick end with `id` finishing a lap of `ticks` (the real tick is skipped). */
function lapOnNextTick(room: Room, id: CarId, ticks: number, valid = true): void {
  const before = room.state;
  const after: GameState = {
    ...before,
    tick: before.tick + 1,
    laps: before.laps.map((lap) =>
      lap.carId === id
        ? { ...lap, laps: lap.laps + 1, lastLap: { ticks, sectors: [], valid } }
        : lap,
    ),
  };
  let ticked = false;
  vi.spyOn(room, 'tick').mockImplementationOnce(() => (ticked = true));
  vi.spyOn(room, 'state', 'get').mockImplementation(() => (ticked ? after : before));
}

const SET_AT = new Date('2026-11-04T10:00:00.000Z');

function recordsServer(): { server: GameServer; records: LapRecords; log: string[] } {
  const records = new LapRecords(':memory:');
  const log: string[] = [];
  return {
    server: new GameServer(
      (line) => log.push(line),
      records,
      () => SET_AT,
    ),
    records,
    log,
  };
}

describe('GameServer — lap records', () => {
  it('records a valid time-trial lap and sends the boards in the welcome', () => {
    const { server, log } = recordsServer();
    inRoom(server, 'Enea', 'Monza', 'timeTrial');
    lapOnNextTick(server.rooms.get(roomKey('timeTrial', 'Monza', 'p1'))!, 'p1', 4860);
    server.advance(FIXED_DT);
    expect(log.at(-1)).toBe('[records] timeTrial/Monza: Enea 81.000 s (P1)');
    const welcome = joined(server, 'Kimi').last('welcome');
    expect(welcome?.type === 'welcome' && welcome.records).toContainEqual({
      mode: 'timeTrial',
      track: 'Monza',
      records: [{ nickname: 'Enea', ticks: 4860, setAt: SET_AT.toISOString() }],
    });
  });

  it('ignores invalid laps, Free practice and the Grand Prix lobby', () => {
    const { server, records } = recordsServer();
    inRoom(server, 'Enea', 'Monza', 'timeTrial');
    lapOnNextTick(server.rooms.get(roomKey('timeTrial', 'Monza', 'p1'))!, 'p1', 4860, false);
    server.advance(FIXED_DT);
    inRoom(server, 'Kimi', 'Monaco');
    lapOnNextTick(server.rooms.get(roomKey('practice', 'Monaco', 'p2'))!, 'p2', 4860);
    server.advance(FIXED_DT);
    inRoom(server, 'Max', 'Barcelona', 'grandPrix');
    lapOnNextTick(server.rooms.get(roomKey('grandPrix', 'Barcelona', 'p3'))!, 'p3', 4860);
    server.advance(FIXED_DT);
    expect(records.boards().every((board) => board.records.length === 0)).toBe(true);
  });

  it('records the Grand Prix laps from qualifying on', () => {
    const { server, records } = recordsServer();
    const enea = inRoom(server, 'Enea', 'Monza', 'grandPrix');
    server.message(enea, encodeMessage({ type: 'gp', action: 'start' }));
    lapOnNextTick(server.rooms.get(roomKey('grandPrix', 'Monza', 'p1'))!, 'p1', 4900);
    server.advance(FIXED_DT);
    expect(records.board('grandPrix', 'Monza')).toEqual([
      { nickname: 'Enea', ticks: 4900, setAt: SET_AT.toISOString() },
    ]);
    expect(records.board('timeTrial', 'Monza')).toEqual([]);
  });
});

describe('finishedLaps', () => {
  it('lists the cars whose lap count grew with a valid lap', () => {
    const before: GameState = { tick: 0, cars: [], impacts: [], laps: [] };
    const lap = (carId: CarId, laps: number, valid: boolean) => ({
      carId,
      laps,
      lastLap: laps > 0 ? { ticks: 5000 + laps, sectors: [], valid } : null,
    });
    const make = (laps: ReturnType<typeof lap>[]): GameState =>
      ({ ...before, laps }) as unknown as GameState;
    const old = make([lap('p1', 1, true), lap('p2', 0, true), lap('p3', 2, true)]);
    const now = make([lap('p1', 2, true), lap('p2', 1, false), lap('p3', 2, true)]);
    expect(finishedLaps(old, now)).toEqual([{ carId: 'p1', ticks: 5002 }]);
  });
});

describe('GameServer — damage (Phase 4)', () => {
  it('has damage only in a Grand Prix, from qualifying on; Free practice and Time trial never', () => {
    const server = new GameServer();
    inRoom(server, 'Enea', 'Monza');
    inRoom(server, 'Kimi', 'Monza', 'timeTrial');
    const max = inRoom(server, 'Max', 'Monza', 'grandPrix');
    const grandPrix = server.rooms.get(roomKey('grandPrix', 'Monza', 'p3'))!;
    server.advance(FIXED_DT);
    expect(grandPrix.damage).toBe(false); // the lobby
    server.message(max, encodeMessage({ type: 'gp', action: 'start' }));
    server.advance(FIXED_DT);
    expect(grandPrix.damage).toBe(true);
    expect(grandPrix.state.cars[0]!.damage).toBeDefined();
    for (const [key, room] of server.rooms) {
      if (key.startsWith('grandPrix')) continue;
      expect(room.damage).toBe(false);
      expect(room.state.cars.every((car) => car.damage === undefined)).toBe(true);
    }
  });
});
