import {
  BARCELONA,
  encodeMessage,
  FIXED_DT,
  MONACO,
  MONZA,
  parseClientMessage,
  SNAPSHOT_EVERY_TICKS,
  type CarId,
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

/** The circuits offered online: one room each (the real F1 circuits). */
export const ROOM_TRACKS: readonly TrackDefinition[] = [MONZA, BARCELONA, MONACO];

/** Longest stretch of real time simulated at once; after a stall we skip time, like the client. */
const MAX_ADVANCE_SECONDS = 0.25;
/** Absorbs floating-point error so N calls of exactly FIXED_DT always give N ticks. */
const EPSILON = 1e-9;

/** A joined player: its id and, once it picked a track, its room's track name. */
interface Member {
  readonly id: CarId;
  track: string | null;
}

/**
 * The multiplayer server's logic: the lobby (nicknames), one room per track in `ROOM_TRACKS`
 * (created when its first player enters, closed when its last one leaves) and the messages between
 * them and the clients. No sockets and no timers, so it is fully testable.
 * See 01_docs/multiplayer.md#server.
 */
export class GameServer {
  readonly lobby = new Lobby();
  /** Live rooms by track name. */
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
      if (member && member.track === null) this.enter(conn, member, message.track);
    } else if (message.type === 'ping') {
      if (member) conn.send(encodeMessage({ type: 'pong', t: message.t }));
    } else if (member?.track) {
      this.rooms.get(member.track)?.queueInput(member.id, message.seq, message.input);
    }
  }

  close(conn: Connection): void {
    const member = this.members.get(conn);
    if (!member) return;
    this.members.delete(conn);
    const nickname = this.nickname(member.id);
    this.lobby.leave(member.id);
    this.log(`[lobby] ${nickname} left (${this.members.size} online)`);
    if (member.track) this.leaveRoom(member.id, member.track);
  }

  /** Feeds real time: runs the fixed ticks it covers in every live room, with their snapshots. */
  advance(seconds: number): void {
    this.accumulator += Math.min(Math.max(seconds, 0), MAX_ADVANCE_SECONDS);
    while (this.accumulator >= FIXED_DT - EPSILON) {
      this.accumulator -= FIXED_DT;
      for (const [track, room] of this.rooms) {
        room.tick();
        if (room.state.tick % SNAPSHOT_EVERY_TICKS === 0) {
          this.broadcast(track, {
            type: 'snapshot',
            state: room.state,
            acks: room.acks,
            inputs: room.lastInputs,
          });
        }
      }
    }
  }

  /** Every offered room with how many players are in it now. */
  roomList(): RoomInfo[] {
    return ROOM_TRACKS.map(({ name }) => ({ track: name, players: this.inRoom(name).length }));
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
    this.members.set(conn, { id: player.id, track: null });
    this.log(`[lobby] ${player.nickname} joined as ${player.id} (${this.members.size} online)`);
    conn.send(encodeMessage({ type: 'welcome', playerId: player.id, rooms: this.roomList() }));
  }

  /** Puts the player in the room of `track`, opening it if nobody is there yet. */
  private enter(conn: Connection, member: Member, track: string): void {
    const definition = ROOM_TRACKS.find((t) => t.name === track);
    if (!definition) return; // not offered: ignored, like any malformed message
    let room = this.rooms.get(track);
    if (!room) {
      room = new Room(definition);
      this.rooms.set(track, room);
      this.log(`[rooms] ${track} is live`);
    }
    room.add(member.id);
    member.track = track;
    const players = this.inRoom(track);
    this.log(`[rooms] ${this.nickname(member.id)} entered ${track} (${players.length} there)`);
    conn.send(encodeMessage({ type: 'entered', track, players }));
    this.broadcast(track, { type: 'players', players }, conn);
  }

  private leaveRoom(id: CarId, track: string): void {
    const room = this.rooms.get(track);
    if (!room) return;
    room.remove(id);
    if (room.isEmpty) {
      this.rooms.delete(track);
      this.log(`[rooms] ${track} closed (empty)`);
      return;
    }
    this.broadcast(track, { type: 'players', players: this.inRoom(track) });
  }

  /** The players in the room of `track`, in join order. */
  private inRoom(track: string): PlayerInfo[] {
    const ids = new Set(
      [...this.members.values()].filter((m) => m.track === track).map((m) => m.id),
    );
    return this.lobby.players().filter((p) => ids.has(p.id));
  }

  private nickname(id: CarId): string {
    return this.lobby.players().find((p) => p.id === id)?.nickname ?? id;
  }

  /** Sends `message` to every player in the room of `track` except `skip`. Encoded once for all. */
  private broadcast(track: string, message: ServerMessage, skip?: Connection): void {
    const text = encodeMessage(message);
    for (const [conn, member] of this.members) {
      if (member.track === track && conn !== skip) conn.send(text);
    }
  }
}
