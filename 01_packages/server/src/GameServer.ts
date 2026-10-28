import {
  BARCELONA,
  encodeMessage,
  FIXED_DT,
  MONACO,
  MONZA,
  parseClientMessage,
  SNAPSHOT_EVERY_TICKS,
  type CarId,
  type OnlineMode,
  type PlayerInfo,
  type RoomInfo,
  type ServerMessage,
  type TrackDefinition,
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

/** The circuits offered online in every mode (the real F1 circuits). */
export const ROOM_TRACKS: readonly TrackDefinition[] = [MONZA, BARCELONA, MONACO];

/** The modes the server runs so far; the others show as work in progress (01_docs/roadmap.md). */
export const READY_MODES: readonly OnlineMode[] = ['practice', 'timeTrial'];

/** Modes where every player drives alone: a private room each (time trial). */
const PRIVATE_MODES: readonly OnlineMode[] = ['timeTrial'];

/**
 * Key of `player`'s room for `mode` on `track` in `GameServer.rooms`: shared by everyone on that
 * circuit (`practice/Monza`), or the player's own in a private mode (`timeTrial/Monza/p3`).
 */
export function roomKey(mode: OnlineMode, track: string, player: CarId): string {
  return PRIVATE_MODES.includes(mode) ? `${mode}/${track}/${player}` : `${mode}/${track}`;
}

/** Longest stretch of real time simulated at once; after a stall we skip time, like the client. */
const MAX_ADVANCE_SECONDS = 0.25;
/** Absorbs floating-point error so N calls of exactly FIXED_DT always give N ticks. */
const EPSILON = 1e-9;

/** A joined player: its id and, once it picked a mode and track, where it is. */
interface Member {
  readonly id: CarId;
  room: { readonly mode: OnlineMode; readonly track: string; readonly key: string } | null;
}

/**
 * The multiplayer server's logic: the lobby (nicknames), one room per ready mode and track in
 * `ROOM_TRACKS`, or one per player in a private mode (created when its first player enters, closed
 * when its last one leaves) and the messages between
 * them and the clients. No sockets and no timers, so it is fully testable.
 * See 01_docs/multiplayer.md#server.
 */
export class GameServer {
  readonly lobby = new Lobby();
  /** Live rooms by `roomKey`. */
  readonly rooms = new Map<string, Room>();
  /** Joined players' connections; a connection is in here only after an accepted hello. */
  private readonly members = new Map<Connection, Member>();
  private accumulator = 0;
  private readonly log: (line: string) => void;

  /** `log` gets one line per join, reject, room change and leave (main.ts prints them). */
  constructor(log: (line: string) => void = () => {}) {
    this.log = log;
  }

  /** Whether `conn` has joined (main.ts closes connections that never do). */
  hasJoined(conn: Connection): boolean {
    return this.members.has(conn);
  }

  message(conn: Connection, raw: string): void {
    const message = parseClientMessage(raw);
    if (!message) return;
    const member = this.members.get(conn);
    if (message.type === 'hello') {
      if (!member) this.hello(conn, message.protocol, message.nickname);
    } else if (message.type === 'enter') {
      if (member && member.room === null) this.enter(conn, member, message.mode, message.track);
    } else if (message.type === 'ping') {
      if (member) conn.send(encodeMessage({ type: 'pong', t: message.t }));
    } else if (member?.room) {
      this.rooms.get(member.room.key)?.queueInput(member.id, message.seq, message.input);
    }
  }

  close(conn: Connection): void {
    const member = this.members.get(conn);
    if (!member) return;
    this.members.delete(conn);
    const nickname = this.nickname(member.id);
    this.lobby.leave(member.id);
    this.log(`[lobby] ${nickname} left (${this.members.size} online)`);
    if (member.room) this.leaveRoom(member.id, member.room.key);
  }

  /** Feeds real time: runs the fixed ticks it covers in every live room, with their snapshots. */
  advance(seconds: number): void {
    this.accumulator += Math.min(Math.max(seconds, 0), MAX_ADVANCE_SECONDS);
    while (this.accumulator >= FIXED_DT - EPSILON) {
      this.accumulator -= FIXED_DT;
      for (const [key, room] of this.rooms) {
        room.tick();
        if (room.state.tick % SNAPSHOT_EVERY_TICKS === 0) {
          this.broadcast(key, {
            type: 'snapshot',
            state: room.state,
            acks: room.acks,
            inputs: room.lastInputs,
          });
        }
      }
    }
  }

  /**
   * Every offered room (ready modes × tracks) with how many players are in it now; for a private
   * mode, how many are driving it on that circuit, each alone.
   */
  roomList(): RoomInfo[] {
    const members = [...this.members.values()];
    return READY_MODES.flatMap((mode) =>
      ROOM_TRACKS.map(({ name: track }) => ({
        mode,
        track,
        players: members.filter((m) => m.room?.mode === mode && m.room.track === track).length,
      })),
    );
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
    this.members.set(conn, { id: player.id, room: null });
    this.log(`[lobby] ${player.nickname} joined as ${player.id} (${this.members.size} online)`);
    conn.send(encodeMessage({ type: 'welcome', playerId: player.id, rooms: this.roomList() }));
  }

  /** Puts the player in the room of `mode` on `track`, opening it if nobody is there yet. */
  private enter(conn: Connection, member: Member, mode: OnlineMode, track: string): void {
    const definition = ROOM_TRACKS.find((t) => t.name === track);
    // Not offered (unknown track, mode not ready yet): ignored, like any malformed message.
    if (!definition || !READY_MODES.includes(mode)) return;
    const key = roomKey(mode, track, member.id);
    let room = this.rooms.get(key);
    if (!room) {
      room = new Room(definition);
      this.rooms.set(key, room);
      this.log(`[rooms] ${key} is live`);
    }
    room.add(member.id);
    member.room = { mode, track, key };
    const players = this.inRoom(key);
    this.log(`[rooms] ${this.nickname(member.id)} entered ${key} (${players.length} there)`);
    conn.send(encodeMessage({ type: 'entered', track, players }));
    this.broadcast(key, { type: 'players', players }, conn);
  }

  private leaveRoom(id: CarId, key: string): void {
    const room = this.rooms.get(key);
    if (!room) return;
    room.remove(id);
    if (room.isEmpty) {
      this.rooms.delete(key);
      this.log(`[rooms] ${key} closed (empty)`);
      return;
    }
    this.broadcast(key, { type: 'players', players: this.inRoom(key) });
  }

  /** The players in the room `key`, in join order. */
  private inRoom(key: string): PlayerInfo[] {
    const ids = new Set(
      [...this.members.values()].filter((m) => m.room?.key === key).map((m) => m.id),
    );
    return this.lobby.players().filter((p) => ids.has(p.id));
  }

  private nickname(id: CarId): string {
    return this.lobby.players().find((p) => p.id === id)?.nickname ?? id;
  }

  /** Sends `message` to every player in the room `key` except `skip`. Encoded once for all. */
  private broadcast(key: string, message: ServerMessage, skip?: Connection): void {
    const text = encodeMessage(message);
    for (const [conn, member] of this.members) {
      if (member.room?.key === key && conn !== skip) conn.send(text);
    }
  }
}
