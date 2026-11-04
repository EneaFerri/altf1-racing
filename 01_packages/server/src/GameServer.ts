import {
  encodeMessage,
  FIXED_DT,
  GP_TRACKS,
  parseClientMessage,
  RECORD_MODES,
  SNAPSHOT_EVERY_TICKS,
  TICK_RATE,
  type CarId,
  type GrandPrixCommand,
  type OnlineMode,
  type GameState,
  type PlayerInfo,
  type RecordMode,
  type RoomInfo,
  type ServerMessage,
} from '@altf1/shared';
import { GrandPrix } from './GrandPrix.ts';
import { finishedLaps, LapRecords } from './LapRecords.ts';
import { Lobby } from './Lobby.ts';
import { Room } from './Room.ts';

/** One client's socket, as seen by the server logic (main.ts adapts `ws` to it; tests fake it). */
export interface Connection {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** Close code for a rejected hello (WebSocket "policy violation"). */
export const REJECT_CLOSE_CODE = 1008;

/** The modes the server runs so far; the others show as work in progress (01_docs/roadmap.md). */
export const READY_MODES: readonly OnlineMode[] = ['practice', 'timeTrial', 'grandPrix'];

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
 * `GP_TRACKS`, or one per player in a private mode (created when its first player enters, closed
 * when its last one leaves) and the messages between
 * them and the clients. No sockets and no timers, so it is fully testable.
 * See 01_docs/multiplayer.md#server.
 */
export class GameServer {
  readonly lobby = new Lobby();
  /** Live rooms by `roomKey`. */
  readonly rooms = new Map<string, Room>();
  /** The mode of each live room, by `roomKey`. */
  private readonly modes = new Map<string, OnlineMode>();
  /** The Grand Prix of each live Grand Prix room, by `roomKey`. */
  private readonly grandPrix = new Map<string, GrandPrix>();
  /** Joined players' connections; a connection is in here only after an accepted hello. */
  private readonly members = new Map<Connection, Member>();
  private accumulator = 0;
  private readonly log: (line: string) => void;
  private readonly records: LapRecords;
  private readonly now: () => Date;

  /**
   * `log` gets one line per join, reject, room change, leave and new lap record (main.ts prints
   * them); `records` keeps the lap records (main.ts opens the file, tests an in-memory one).
   */
  constructor(
    log: (line: string) => void = () => {},
    records: LapRecords = new LapRecords(':memory:'),
    now: () => Date = () => new Date(),
  ) {
    this.log = log;
    this.records = records;
    this.now = now;
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
    } else if (message.type === 'gp') {
      if (member?.room) this.grandPrixCommand(member.id, member.room.key, message);
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
        const before = room.state;
        room.tick();
        const grandPrix = this.grandPrix.get(key);
        // Before the GP reads the tick: a car it retires on its last lap still counts.
        if (!grandPrix || grandPrix.isTimed) this.recordLaps(key, before, room.state);
        const phase = grandPrix?.info.phase;
        if (grandPrix?.afterTick()) {
          if (grandPrix.info.phase !== phase) this.log(`[gp] ${key} → ${grandPrix.info.phase}`);
          this.broadcast(key, { type: 'grandPrix', ...grandPrix.info });
        }
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
      GP_TRACKS.map(({ name: track }) => ({
        mode,
        track,
        players: members.filter((m) => m.room?.mode === mode && m.room.track === track).length,
        // A Grand Prix room is shared, so its key needs no player.
        status: this.grandPrix.get(roomKey(mode, track, ''))?.isOpen === false ? 'running' : 'open',
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
    conn.send(
      encodeMessage({
        type: 'welcome',
        playerId: player.id,
        rooms: this.roomList(),
        records: this.records.boards(),
      }),
    );
  }

  /** Puts the player in the room of `mode` on `track`, opening it if nobody is there yet. */
  private enter(conn: Connection, member: Member, mode: OnlineMode, track: string): void {
    const definition = GP_TRACKS.find((t) => t.name === track);
    // Not offered (unknown track, mode not ready yet): ignored, like any malformed message.
    if (!definition || !READY_MODES.includes(mode)) return;
    const key = roomKey(mode, track, member.id);
    if (this.grandPrix.get(key)?.isOpen === false) {
      conn.send(encodeMessage({ type: 'refused', reason: 'inProgress' }));
      return;
    }
    let room = this.rooms.get(key);
    if (!room) {
      // Only the Grand Prix drives the pit lane (Phase 4); every other mode keeps it as scenery.
      room = new Room(definition, { pitLane: mode === 'grandPrix' });
      this.rooms.set(key, room);
      this.modes.set(key, mode);
      if (mode === 'grandPrix') this.grandPrix.set(key, new GrandPrix(room));
      this.log(`[rooms] ${key} is live`);
    }
    const grandPrix = this.grandPrix.get(key);
    room.add(member.id);
    member.room = { mode, track, key };
    const players = this.inRoom(key);
    this.log(`[rooms] ${this.nickname(member.id)} entered ${key} (${players.length} there)`);
    conn.send(encodeMessage({ type: 'entered', track, players }));
    this.broadcast(key, { type: 'players', players }, conn);
    if (grandPrix) {
      grandPrix.add(member.id, this.nickname(member.id));
      this.broadcast(key, { type: 'grandPrix', ...grandPrix.info });
    }
  }

  /** Offers the valid laps finished in room `key`'s last tick to the lap records, in a record mode. */
  private recordLaps(key: string, before: GameState, after: GameState): void {
    const mode = this.modes.get(key);
    if (!RECORD_MODES.includes(mode as RecordMode)) return;
    const track = this.rooms.get(key)!.definition.name;
    for (const { carId, ticks } of finishedLaps(before, after)) {
      const nickname = this.nickname(carId);
      const position = this.records.submit(mode as RecordMode, track, nickname, ticks, this.now());
      if (position !== null) {
        const time = (ticks / TICK_RATE).toFixed(3);
        this.log(`[records] ${mode}/${track}: ${nickname} ${time} s (P${position})`);
      }
    }
  }

  /** A GP command from player `id` in room `key`: applied (and told to the room) if it counts. */
  private grandPrixCommand(id: CarId, key: string, command: GrandPrixCommand): void {
    const grandPrix = this.grandPrix.get(key);
    if (!grandPrix?.command(id, command)) return;
    this.log(`[gp] ${key}: ${command.action} by ${this.nickname(id)} → ${grandPrix.info.phase}`);
    this.broadcast(key, { type: 'grandPrix', ...grandPrix.info });
  }

  private leaveRoom(id: CarId, key: string): void {
    const room = this.rooms.get(key);
    if (!room) return;
    room.remove(id);
    const grandPrix = this.grandPrix.get(key);
    grandPrix?.remove(id);
    if (room.isEmpty) {
      this.rooms.delete(key);
      this.modes.delete(key);
      this.grandPrix.delete(key); // the next player in starts a new Grand Prix
      this.log(`[rooms] ${key} closed (empty)`);
      return;
    }
    this.broadcast(key, { type: 'players', players: this.inRoom(key) });
    // The manager may have changed.
    if (grandPrix) this.broadcast(key, { type: 'grandPrix', ...grandPrix.info });
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
