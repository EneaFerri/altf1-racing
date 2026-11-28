import { FLAG_PARAMS, type FlagParams } from '../config/flags';
import { TICK_RATE } from '../config/sim';
import type { Vec2 } from '../math/vec2';
import type { CarId } from '../sim/car';
import type { GameState } from '../sim/game';
import { locateOnLoop } from '../track/query';
import type { Track } from '../track/types';

/**
 * A crash's debris and yellow flag (R.2, 01_docs/flags.md): the debris lies round `point` until
 * tick `until`, the flag is out in timing sector `sector` (0-based) as long.
 */
export interface YellowFlag {
  readonly carId: CarId;
  /** Where the car hit the wall. */
  readonly point: Vec2;
  /** Main-loop progress there (m from the line): the debris lies along the track from it. */
  readonly progress: number;
  readonly sector: number;
  readonly since: number;
  readonly until: number;
}

/**
 * `flags` after a tick of `state` on `track`: expired ones gone, a new one for each hard wall hit by
 * one of `drivers` (not the same crash as a flag of that car's still out). Returns `flags` itself
 * when nothing changed. Pure.
 */
export function stepYellowFlags(
  flags: readonly YellowFlag[],
  state: GameState,
  track: Track,
  drivers: readonly CarId[],
  p: FlagParams = FLAG_PARAMS,
): readonly YellowFlag[] {
  const { tick } = state;
  let next = flags.filter((flag) => flag.until > tick);
  for (const impact of state.impacts) {
    if (impact.other !== 'wall' || impact.strength < p.debrisImpact) continue;
    if (!drivers.includes(impact.carId)) continue;
    const sameCrash = next.some(
      (flag) => flag.carId === impact.carId && tick - flag.since < p.sameCrash * TICK_RATE,
    );
    if (sameCrash) continue;
    const progress = locateOnLoop(track, impact.point).distance;
    next = [
      ...next,
      {
        carId: impact.carId,
        point: impact.point,
        progress,
        sector: sectorAt(track, progress),
        since: tick,
        until: tick + Math.round(p.seconds * TICK_RATE),
      },
    ];
  }
  return next.length === flags.length && next.every((flag, i) => flag === flags[i]) ? flags : next;
}

/** The timing sector (0-based) at main-loop `progress`. */
export function sectorAt(track: Track, progress: number): number {
  let sector = 0;
  track.sectorStarts.forEach((start, i) => {
    if (progress >= start) sector = i;
  });
  return sector;
}

/** The sectors under a yellow flag, in order, each once. */
export function yellowSectors(flags: readonly YellowFlag[]): number[] {
  return [...new Set(flags.map((flag) => flag.sector))].sort((a, b) => a - b);
}

/**
 * One piece of a crash's debris on the track (R.2), as both clients draw it (the web's
 * `TrackDebris`, the Mac's `DebrisField`): where, how big, which way, what it is. */
export interface DebrisPiece {
  readonly x: number;
  /** The road's height there (0 on a flat track). */
  readonly y: number;
  readonly z: number;
  /** Size: across, height, along (m). */
  readonly width: number;
  readonly height: number;
  readonly length: number;
  readonly yaw: number;
  /** Carbon, the car's paint, or a white endplate's bit. */
  readonly kind: 'carbon' | 'paint' | 'white';
}

/** Pieces per crash. */
const PIECES = 40;
/** They lie this far before and after the hit along the track (m): the car slid on. */
const BEFORE = 4;
const AFTER = 35;

/**
 * Where `flag`'s crash left its debris on `track`: pieces of carbon and paint strewn along the
 * track from the hit, from the wall's side across to near the middle of the road. Seeded by the
 * crash, so every player sees the same pieces in the same places (on the Mac too). Pure.
 */
export function debrisLayout(track: Track, flag: YellowFlag): DebrisPiece[] {
  return debrisOf(track, flag);
}

/** The side of the track `flag`'s crash was on: 1 right of the driving direction, −1 left. */
export function crashSide(track: Track, flag: YellowFlag): 1 | -1 {
  return locateOnLoop(track, flag.point).lateral >= 0 ? 1 : -1;
}

function debrisOf(track: Track, flag: YellowFlag): DebrisPiece[] {
  const random = seeded(flag.since * 31 + hash(flag.carId));
  const side = crashSide(track, flag);
  const n = track.samples.length;
  return Array.from({ length: PIECES }, () => {
    const along = flag.progress - BEFORE + random() * (BEFORE + AFTER);
    const i =
      Math.round(((((along % track.length) + track.length) % track.length) / track.length) * n) % n;
    const sample = track.samples[i]!;
    // Most near the wall it came off, some thrown across the road.
    const across = side * sample.halfWidth * (1 - 0.85 * random() * random());
    const roll = random();
    const kind = roll < 0.5 ? 'carbon' : roll < 0.82 ? 'paint' : 'white';
    // Mostly shards, one in six a bigger chunk (a wing's piece, an endplate).
    const chunk = random() < 1 / 6;
    const size = chunk ? 0.5 + random() * 0.5 : 0.18 + random() * 0.35;
    return {
      x: sample.position.x + sample.normal.x * across,
      y: sample.height,
      z: sample.position.z + sample.normal.z * across,
      width: size,
      height: chunk ? 0.08 + random() * 0.12 : 0.03 + random() * 0.05,
      length: size * (0.4 + random() * 0.8),
      yaw: random() * Math.PI * 2,
      kind,
    };
  });
}

function seeded(seed: number): () => number {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

function hash(text: string): number {
  return [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);
}
