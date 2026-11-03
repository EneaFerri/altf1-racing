import type { TrackDefinition } from '../types';
import { BARCELONA } from './barcelona';
import { KRUNCAR } from './kruncar';
import { MEXICO } from './mexico';
import { MONACO } from './monaco';
import { MONZA } from './monza';
import { TEST_TRACK } from './testTrack';

export * from './barcelona';
export * from './kruncar';
export * from './mexico';
export * from './monaco';
export * from './monza';
export * from './testTrack';

/** Every playable track, in the order the track menu lists them. */
export const TRACKS: readonly TrackDefinition[] = [
  TEST_TRACK,
  KRUNCAR,
  MONZA,
  BARCELONA,
  MONACO,
  MEXICO,
];

/**
 * The real F1 circuits, in menu order: offered online in every mode (one room list on the server)
 * and drawn with a starting grid. Add a new circuit here and to `TRACKS` (01_docs/circuits.md).
 */
export const GP_TRACKS: readonly TrackDefinition[] = [MONZA, BARCELONA, MONACO, MEXICO];
