import {
  encodeMessage,
  FIXED_DT,
  parseClientMessage,
  SNAPSHOT_EVERY_TICKS,
  type CarId,
  type ServerMessage,
} from '@altf1/shared';
import { Lobby } from './Lobby.ts';
import { Room } from './Room.ts';

/** One client's socket, as seen by the server logic (main.ts adapts `ws` to it; tests fake it). */
export interface Connection {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** Close code for a rejected hello (WebSocket "policy violation"). */
export const REJECT_CLOSE_CODE = 1008;

/** Longest stretch of real time simulated at once; after a stall we skip time, like the client. */
const MAX_ADVANCE_SECONDS = 0.25;
/** Absorbs floating-point error so N calls of exactly FIXED_DT always give N ticks. */
const EPSILON = 1e-9;

/**
 * The multiplayer server's logic: lobby (nicknames), the room (simulation) and the messages
 * between them and the clients. No sockets and no timers, so it is fully testable.
 * See 01_docs/multiplayer.md#server.
 */
export class GameServer {
  readonly lobby = new Lobby();
  readonly room = new Room();
  /** Joined players' connections; a connection is in here only after an accepted hello. */
  private readonly players = new Map<Connection, CarId>();
  private accumulator = 0;
  private readonly log: (line: string) => void;

  /** `log` gets one line per join, reject and leave (main.ts prints them). */
  constructor(log: (line: string) => void = () => {}) {
    this.log = log;
  }

  /** Whether `conn` has joined (main.ts closes connections that never do). */
  hasJoined(conn: Connection): boolean {
    return this.players.has(conn);
  }

  message(conn: Connection, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) return;
    const id = this.players.get(conn);
    if (message.type === 'hello') {
      if (id === undefined) this.hello(conn, message.protocol, message.nickname);
    } else if (id !== undefined) {
      this.room.setInput(id, message.input);
    }
  }

  close(conn: Connection): void {
    const id = this.players.get(conn);
    if (id === undefined) return;
    this.players.delete(conn);
    const nickname = this.lobby.players().find((p) => p.id === id)?.nickname;
    this.lobby.leave(id);
    this.room.remove(id);
    this.log(`[lobby] ${nickname} left (${this.players.size} online)`);
    this.broadcast({ type: 'players', players: this.lobby.players() });
  }

  /** Feeds real time: runs the fixed ticks it covers and sends a snapshot every few ticks. */
  advance(seconds: number): void {
    this.accumulator += Math.min(Math.max(seconds, 0), MAX_ADVANCE_SECONDS);
    while (this.accumulator >= FIXED_DT - EPSILON) {
      this.accumulator -= FIXED_DT;
      if (this.players.size === 0) continue;
      this.room.tick();
      if (this.room.state.tick % SNAPSHOT_EVERY_TICKS === 0) {
        this.broadcast({ type: 'snapshot', state: this.room.state });
      }
    }
  }

  private hello(conn: Connection, protocol: number, nickname: string): void {
    const result = this.lobby.join(protocol, nickname);
    if (!result.ok) {
      this.log(`[lobby] rejected "${nickname}": ${result.reason}`);
      conn.send(encodeMessage({ type: 'rejected', reason: result.reason }));
      conn.close(REJECT_CLOSE_CODE, result.reason);
      return;
    }
    const { player } = result;
    this.players.set(conn, player.id);
    this.room.add(player.id);
    const players = this.lobby.players();
    this.log(`[lobby] ${player.nickname} joined as ${player.id} (${players.length} online)`);
    conn.send(
      encodeMessage({
        type: 'welcome',
        playerId: player.id,
        track: this.room.definition.name,
        players,
      }),
    );
    this.broadcast({ type: 'players', players }, conn);
  }

  /** Sends `message` to every joined player except `skip`. Encoded once for all. */
  private broadcast(message: ServerMessage, skip?: Connection): void {
    const text = encodeMessage(message);
    for (const conn of this.players.keys()) if (conn !== skip) conn.send(text);
  }
}
