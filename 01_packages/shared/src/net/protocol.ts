import type { CarId } from '../sim/car';
import type { GameState } from '../sim/game';
import type { InputCommand } from '../types/input';

/**
 * Messages between the game and the multiplayer server: JSON over one WebSocket.
 * See 01_docs/multiplayer.md#protocol. Bump the version whenever a message changes shape.
 */
export const PROTOCOL_VERSION = 5;

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

/** A room the server offers: one per mode and track, live as soon as a player is in it. */
export interface RoomInfo {
  readonly mode: OnlineMode;
  /** The track's name (an entry of TRACKS). */
  readonly track: string;
  /** Players in it right now. */
  readonly players: number;
}

export type RejectReason = 'taken' | 'invalid' | 'full' | 'version';

export type ClientMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly nickname: string }
  /** After the welcome: go into the room of this mode and track. */
  | { readonly type: 'enter'; readonly mode: OnlineMode; readonly track: string }
  /** One client tick's input; `seq` grows by one every tick (see 01_docs/multiplayer.md#prediction-22). */
  | { readonly type: 'input'; readonly seq: number; readonly input: InputCommand }
  /** Round-trip probe: the server echoes `t` back in a `pong`. */
  | { readonly type: 'ping'; readonly t: number };

export type ServerMessage =
  /** Nickname accepted: the player's id and the rooms to pick from (modes without any aren't ready). */
  | { readonly type: 'welcome'; readonly playerId: CarId; readonly rooms: readonly RoomInfo[] }
  | { readonly type: 'rejected'; readonly reason: RejectReason }
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
  | { readonly type: 'pong'; readonly t: number };

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
    default:
      return null;
  }
}

/** Reads a message sent by the server (trusted): only the JSON and the message type are checked. */
export function parseServerMessage(raw: string): ServerMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  const known = ['welcome', 'rejected', 'entered', 'players', 'snapshot', 'pong'];
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
