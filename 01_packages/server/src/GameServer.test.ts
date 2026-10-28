import { describe, expect, it } from 'vitest';
import {
  encodeMessage,
  FIXED_DT,
  NEUTRAL_INPUT,
  parseServerMessage,
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY_TICKS,
  type OnlineMode,
  type ServerMessage,
} from '@altf1/shared';
import { GameServer, REJECT_CLOSE_CODE, roomKey, type Connection } from './GameServer.ts';

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

function inRoom(server: GameServer, nickname: string, track: string): FakeConnection {
  const conn = joined(server, nickname);
  server.message(conn, enter(track));
  return conn;
}

const MONZA_PRACTICE = roomKey('practice', 'Monza');

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
        rooms: [
          { mode: 'practice', track: 'Monza', players: 0 },
          { mode: 'practice', track: 'Barcelona', players: 0 },
          { mode: 'practice', track: 'Monaco', players: 1 },
        ],
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

  it('ignores an unknown track, a mode not ready, a second enter and inputs before entering', () => {
    const server = new GameServer();
    const enea = joined(server, 'Enea');
    server.message(enea, input(1));
    server.message(enea, enter('Test Ring'));
    server.message(enea, enter('Monza', 'grandPrix'));
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

  it('simulates each live room at 60 Hz with a snapshot every other tick', () => {
    const server = new GameServer();
    const enea = inRoom(server, 'Enea', 'Barcelona');
    const waiting = joined(server, 'Kimi'); // joined, no room yet: no snapshots
    server.message(enea, input(1));
    oneSecond(server);
    expect(server.rooms.get(roomKey('practice', 'Barcelona'))!.state.tick).toBe(60);
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
