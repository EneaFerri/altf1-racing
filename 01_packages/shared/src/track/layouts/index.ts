import type { TrackDefinition } from '../types';
import { TEST_TRACK } from './testTrack';

export * from './testTrack';

/** Every playable track, in the order the track menu lists them. */
export const TRACKS: readonly TrackDefinition[] = [TEST_TRACK];
