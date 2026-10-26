import { describe, expect, it } from 'vitest';
import {
  encodeMessage,
  FIXED_DT,
  NEUTRAL_INPUT,
  parseServerMessage,
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY_TICKS,
  type ServerMessage,
} from '@altf1/shared';
import { GameServer, REJECT_CLOSE_CODE, type Connection } from './GameServer.ts';

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
const input = (throttle: number): string =>
  encodeMessage({ type: 'input', input: { ...NEUTRAL_INPUT, throttle } });

function joined(server: GameServer, nickname: string): FakeConnection {
  const conn = new FakeConnection();
  server.message(conn, hello(nickname));
  return conn;
}

describe('GameServer', () => {
  it('welcomes a player with its id, the track and everyone online, and tells the others', () => {
    const server = new GameServer();
    const enea = joined(server, 'Enea');
    expect(enea.received[0]).toEqual({
      type: 'welcome',
      playerId: 'p1',
      track: 'Test Ring',
      players: [{ id: 'p1', nickname: 'Enea', livery: 0 }],
    });
    const kimi = joined(server, 'Kimi');
    expect(kimi.received[0]).toMatchObject({ type: 'welcome', playerId: 'p2' });
    expect(enea.last('players')).toEqual({
      type: 'players',
      players: [
        { id: 'p1', nickname: 'Enea', livery: 0 },
        { id: 'p2', nickname: 'Kimi', livery: 1 },
      ],
    });
    expect(kimi.count('players')).toBe(0); // the welcome already lists everyone
    expect(server.room.state.cars.map((c) => c.id)).toEqual(['p1', 'p2']);
  });

  it('rejects a taken nickname (any case) and closes that connection', () => {
    const server = new GameServer();
    joined(server, 'Enea');
    const copy = joined(server, 'ENEA');
    expect(copy.received).toEqual([{ type: 'rejected', reason: 'taken' }]);
    expect(copy.closedWith).toBe(REJECT_CLOSE_CODE);
    expect(server.hasJoined(copy)).toBe(false);
    expect(server.room.state.cars).toHaveLength(1);
  });

  it('rejects an old client and an invalid nickname', () => {
    const server = new GameServer();
    expect(joined(server, 'x').received).toEqual([{ type: 'rejected', reason: 'invalid' }]);
    const old = new FakeConnection();
    server.message(old, hello('Enea', PROTOCOL_VERSION - 1));
    expect(old.received).toEqual([{ type: 'rejected', reason: 'version' }]);
  });

  it('ignores garbage, inputs before hello and a second hello', () => {
    const server = new GameServer();
    const conn = new FakeConnection();
    server.message(conn, 'garbage');
    server.message(conn, input(1));
    expect(conn.received).toEqual([]);
    expect(server.hasJoined(conn)).toBe(false);
    server.message(conn, hello('Enea'));
    server.message(conn, hello('Other'));
    expect(conn.count('welcome')).toBe(1);
    expect(server.lobby.players()).toHaveLength(1);
  });

  it('frees the nickname and removes the car when a player leaves', () => {
    const server = new GameServer();
    const enea = joined(server, 'Enea');
    const kimi = joined(server, 'Kimi');
    server.close(enea);
    expect(kimi.last('players')).toEqual({
      type: 'players',
      players: [{ id: 'p2', nickname: 'Kimi', livery: 1 }],
    });
    expect(server.room.state.cars.map((c) => c.id)).toEqual(['p2']);
    expect(joined(server, 'enea').received[0]).toMatchObject({ type: 'welcome', playerId: 'p3' });
    server.close(new FakeConnection()); // a socket that never joined: nothing happens
  });

  it('simulates at 60 Hz and sends a snapshot every other tick to joined players only', () => {
    const server = new GameServer();
    const enea = joined(server, 'Enea');
    const kimi = joined(server, 'Kimi');
    const lurker = new FakeConnection();
    server.message(enea, input(1));
    for (let i = 0; i < 4; i++) server.advance(0.25); // one second of real time
    expect(server.room.state.tick).toBe(60);
    expect(enea.count('snapshot')).toBe(60 / SNAPSHOT_EVERY_TICKS);
    expect(kimi.count('snapshot')).toBe(60 / SNAPSHOT_EVERY_TICKS);
    expect(lurker.received).toEqual([]);
    const snapshot = kimi.last('snapshot');
    if (snapshot?.type !== 'snapshot') throw new Error('no snapshot');
    expect(snapshot.state.cars.map((c) => c.id)).toEqual(['p1', 'p2']);
    const p1 = snapshot.state.cars[0]!;
    expect(Math.hypot(p1.velocity.x, p1.velocity.z)).toBeGreaterThan(10); // Enea's throttle
  });

  it('keeps fractional time for the next call and never catches up more than 0.25 s', () => {
    const server = new GameServer();
    joined(server, 'Enea');
    server.advance(FIXED_DT * 0.6);
    expect(server.room.state.tick).toBe(0);
    server.advance(FIXED_DT * 0.6);
    expect(server.room.state.tick).toBe(1);
    server.advance(10);
    expect(server.room.state.tick).toBe(1 + 15);
  });

  it('does not simulate while nobody is connected', () => {
    const server = new GameServer();
    server.advance(1);
    expect(server.room.state.tick).toBe(0);
  });
});
