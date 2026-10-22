import type { TrackDefinition } from '../types';
import { KRUNCAR } from './kruncar';
import { TEST_TRACK } from './testTrack';

export * from './kruncar';
export * from './testTrack';

/** Every playable track, in the order the track menu lists them. */
export const TRACKS: readonly TrackDefinition[] = [TEST_TRACK, KRUNCAR];
