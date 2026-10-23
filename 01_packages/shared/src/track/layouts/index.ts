import type { TrackDefinition } from '../types';
import { BARCELONA } from './barcelona';
import { KRUNCAR } from './kruncar';
import { MONZA } from './monza';
import { TEST_TRACK } from './testTrack';

export * from './barcelona';
export * from './kruncar';
export * from './monza';
export * from './testTrack';

/** Every playable track, in the order the track menu lists them. */
export const TRACKS: readonly TrackDefinition[] = [TEST_TRACK, KRUNCAR, MONZA, BARCELONA];
