import type { CarId } from '../sim/car';
import type { GameState } from '../sim/game';
import type { InputCommand } from '../types/input';

/**
 * Messages between the game and the multiplayer server: JSON over one WebSocket.
 * See 01_docs/multiplayer.md#protocol. Bump the version whenever a message changes shape.
 */
export const PROTOCOL_VERSION = 1;

/** Players in the room at most (one per grid slot used). */
export const MAX_PLAYERS = 8;

/** The server sends a snapshot every this many ticks (2 = 30 Hz at TICK_RATE 60). */
export const SNAPSHOT_EVERY_TICKS = 2;

/** Longest nickname string the server even looks at; the real limit is in nickname.ts. */
const MAX_RAW_NICKNAME = 64;

export interface PlayerInfo {
  readonly id: CarId;
  readonly nickname: string;
  /** Livery index (the lowest one free when the player joined); the client maps it to colours. */
  readonly livery: number;
}

export type RejectReason = 'taken' | 'invalid' | 'full' | 'version';

export type ClientMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly nickname: string }
  | { readonly type: 'input'; readonly input: InputCommand };

export type ServerMessage =
  | {
      readonly type: 'welcome';
      readonly playerId: CarId;
      /** Name of the room's track (an entry of TRACKS). */
      readonly track: string;
      readonly players: readonly PlayerInfo[];
    }
  | { readonly type: 'rejected'; readonly reason: RejectReason }
  | { readonly type: 'players'; readonly players: readonly PlayerInfo[] }
  | { readonly type: 'snapshot'; readonly state: GameState };

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
    case 'input': {
      const input = parseInput(data.input);
      return input && { type: 'input', input };
    }
    default:
      return null;
  }
}

/** Reads a message sent by the server (trusted): only the JSON and the message type are checked. */
export function parseServerMessage(raw: string): ServerMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  const known = ['welcome', 'rejected', 'players', 'snapshot'];
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
