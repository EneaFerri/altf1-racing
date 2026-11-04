import { GRAND_PRIX, type RaceLaps } from '../config/grandPrix';
import type { StartHold } from '../race/hold';
import type { QualifyingEntry } from '../race/qualifying';
import type { RaceStanding } from '../race/standings';
import type { CarId } from '../sim/car';
import type { GameState } from '../sim/game';
import type { InputCommand } from '../types/input';

/**
 * Messages between the game and the multiplayer server: JSON over one WebSocket.
 * See 01_docs/multiplayer.md#protocol. Bump the version whenever a message changes shape.
 */
export const PROTOCOL_VERSION = 13;

/** Players online at most, over all rooms. */
export const MAX_PLAYERS = 8;

/** The server sends a snapshot every this many ticks (2 = 30 Hz at TICK_RATE 60). */
export const SNAPSHOT_EVERY_TICKS = 2;

/** Longest nickname string the server even looks at; the real limit is in nickname.ts. */
const MAX_RAW_NICKNAME = 64;
/** Longest track name the server even looks at. */
const MAX_RAW_TRACK = 64;

export interface PlayerInfo {
  readonly id: CarId;
  readonly nickname: string;
  /** Livery index (the lowest one free when the player joined); the client maps it to colours. */
  readonly livery: number;
}

/** The online game modes, in menu order. See 01_docs/multiplayer.md#modes-23. */
export const ONLINE_MODES = ['practice', 'timeTrial', 'grandPrix'] as const;
export type OnlineMode = (typeof ONLINE_MODES)[number];

/** The modes whose laps go into the lap records. See 01_docs/multiplayer.md#lap-records-25a. */
export const RECORD_MODES = ['timeTrial', 'grandPrix'] as const satisfies readonly OnlineMode[];
export type RecordMode = (typeof RECORD_MODES)[number];

/** Lap records kept per mode and circuit (one per player, the fastest). */
export const RECORDS_PER_TRACK = 10;

/** One player's best lap on a record board. */
export interface LapRecord {
  readonly nickname: string;
  /** The lap's time in ticks (see config/sim.ts). */
  readonly ticks: number;
  /** When it was set, ISO 8601 in UTC. */
  readonly setAt: string;
}

/** The best laps of one mode on one circuit, fastest first (at most RECORDS_PER_TRACK). */
export interface RecordBoard {
  readonly mode: RecordMode;
  readonly track: string;
  readonly records: readonly LapRecord[];
}

/** Whether a room takes newcomers: a Grand Prix is `running` from its start on. */
export type RoomStatus = 'open' | 'running';

/** A room the server offers: one per mode and track, live as soon as a player is in it. */
export interface RoomInfo {
  readonly mode: OnlineMode;
  /** The track's name (an entry of TRACKS). */
  readonly track: string;
  /** Players in it right now. */
  readonly players: number;
  readonly status: RoomStatus;
}

/**
 * Where a Grand Prix is: waiting in the lobby, qualifying, on the grid waiting for the manager,
 * racing (from the start lights on), over. See 01_docs/multiplayer.md#grand-prix.
 */
export type GrandPrixPhase = 'lobby' | 'qualifying' | 'grid' | 'race' | 'results';

/** A Grand Prix as its players see it. */
export interface GrandPrixInfo {
  readonly phase: GrandPrixPhase;
  /**
   * The GP manager: the player who decides when it moves on (the first driver in); null only when
   * every driver of a new lobby left while others are still on the results card.
   */
  readonly manager: CarId | null;
  /**
   * The players in this Grand Prix, in arrival order. After a play again the room may also hold
   * players still on the results card, who are not in it.
   */
  readonly drivers: readonly CarId[];
  /** Qualifying in order (live while it runs, then the starting grid); empty in the lobby. */
  readonly qualifying: readonly QualifyingEntry[];
  /** The race classification, live (updated at every timing line); empty before the race. */
  readonly race: readonly RaceStanding[];
  /** Race distance chosen by the manager; null before the race. */
  readonly raceLaps: RaceLaps | null;
  /** Cars held on the grid (and the start lights); null while they may drive. */
  readonly hold: StartHold | null;
  /** Each driver's pit box (an index into the pit lane's boxes), kept from joining to leaving. */
  readonly boxes: Readonly<Record<CarId, number>>;
}

/** What the GP manager can ask for, each in its phase; `playAgain` is open to every player. */
export type GrandPrixCommand =
  /** Lobby → qualifying. */
  | { readonly action: 'start' }
  /** Qualifying → grid, without waiting for everyone's laps. */
  | { readonly action: 'endQualifying' }
  /** Grid → race over `laps` laps: the start lights begin. */
  | { readonly action: 'startRace'; readonly laps: RaceLaps }
  /** Race → results, without waiting for everyone to finish. */
  | { readonly action: 'endRace' }
  /**
   * Any player, from the results card: in the results, a new lobby on the same circuit (the sender
   * is its manager); in that lobby, join it.
   */
  | { readonly action: 'playAgain' };

export type RejectReason = 'taken' | 'invalid' | 'full' | 'version';

export type ClientMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly nickname: string }
  /** After the welcome: go into the room of this mode and track. */
  | { readonly type: 'enter'; readonly mode: OnlineMode; readonly track: string }
  /** One client tick's input; `seq` grows by one every tick (see 01_docs/multiplayer.md#prediction-22). */
  | { readonly type: 'input'; readonly seq: number; readonly input: InputCommand }
  /** Round-trip probe: the server echoes `t` back in a `pong`. */
  | { readonly type: 'ping'; readonly t: number }
  /** In a Grand Prix: the manager's command (the server ignores anyone else's). */
  | ({ readonly type: 'gp' } & GrandPrixCommand);

export type ServerMessage =
  /**
   * Nickname accepted: the player's id, the rooms to pick from (modes without any aren't ready)
   * and the lap records, one board per record mode and circuit.
   */
  | {
      readonly type: 'welcome';
      readonly playerId: CarId;
      readonly rooms: readonly RoomInfo[];
      readonly records: readonly RecordBoard[];
    }
  | { readonly type: 'rejected'; readonly reason: RejectReason }
  /** `enter` refused: that circuit's Grand Prix has started (the player stays joined). */
  | { readonly type: 'refused'; readonly reason: 'inProgress' }
  /** In the room: its track and the players in it (the car appears in the next snapshots). */
  | { readonly type: 'entered'; readonly track: string; readonly players: readonly PlayerInfo[] }
  /** The players in the sender's room, after every join and leave there. */
  | { readonly type: 'players'; readonly players: readonly PlayerInfo[] }
  /**
   * The room's state; per car, `acks` = the `seq` of the last input it ran (absent before any) and
   * `inputs` = that input (absent before any), so clients can predict every car.
   */
  | {
      readonly type: 'snapshot';
      readonly state: GameState;
      readonly acks: Readonly<Record<CarId, number>>;
      readonly inputs: Readonly<Record<CarId, InputCommand>>;
    }
  /** Echo of a `ping`. */
  | { readonly type: 'pong'; readonly t: number }
  /** The room's Grand Prix, on entering and whenever its phase or manager changes. */
  | ({ readonly type: 'grandPrix' } & GrandPrixInfo);

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Reads a message sent by a client. Untrusted: anything malformed gives `null`, numbers must be
 * finite and are clamped to their range, and only the known fields are kept.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'hello': {
      const { protocol, nickname } = data;
      if (!isFiniteNumber(protocol) || typeof nickname !== 'string') return null;
      if (nickname.length > MAX_RAW_NICKNAME) return null;
      return { type: 'hello', protocol, nickname };
    }
    case 'enter': {
      const { mode, track } = data;
      if (!ONLINE_MODES.includes(mode as OnlineMode)) return null;
      if (typeof track !== 'string' || track.length > MAX_RAW_TRACK) return null;
      return { type: 'enter', mode: mode as OnlineMode, track };
    }
    case 'input': {
      const { seq } = data;
      if (!Number.isSafeInteger(seq) || (seq as number) < 0) return null;
      const input = parseInput(data.input);
      return input && { type: 'input', seq: seq as number, input };
    }
    case 'ping': {
      const { t } = data;
      return isFiniteNumber(t) ? { type: 'ping', t } : null;
    }
    case 'gp': {
      const { action, laps } = data;
      if (
        action === 'start' ||
        action === 'endQualifying' ||
        action === 'endRace' ||
        action === 'playAgain'
      ) {
        return { type: 'gp', action };
      }
      if (action !== 'startRace' || !GRAND_PRIX.raceLaps.includes(laps as RaceLaps)) return null;
      return { type: 'gp', action, laps: laps as RaceLaps };
    }
    default:
      return null;
  }
}

/** Reads a message sent by the server (trusted): only the JSON and the message type are checked. */
export function parseServerMessage(raw: string): ServerMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  const known = [
    'welcome',
    'rejected',
    'refused',
    'entered',
    'players',
    'snapshot',
    'pong',
    'grandPrix',
  ];
  return known.includes(data.type as string) ? (data as unknown as ServerMessage) : null;
}

function parseInput(data: unknown): InputCommand | null {
  if (!isRecord(data)) return null;
  const { throttle, brake, reverse, steer, reset } = data;
  if (![throttle, brake, reverse, steer].every(isFiniteNumber) || typeof reset !== 'boolean') {
    return null;
  }
  return {
    throttle: clamp(throttle as number, 0, 1),
    brake: clamp(brake as number, 0, 1),
    reverse: clamp(reverse as number, 0, 1),
    steer: clamp(steer as number, -1, 1),
    reset,
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
