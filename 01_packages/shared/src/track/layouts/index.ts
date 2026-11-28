import type { TrackDefinition } from '../types';
import { BAKU } from './baku';
import { BARCELONA } from './barcelona';
import { LAS_VEGAS } from './lasVegas';
import { MEXICO } from './mexico';
import { MONACO } from './monaco';
import { MONZA } from './monza';
import { SAO_PAULO } from './saoPaulo';
import { SINGAPORE } from './singapore';

export * from './baku';
export * from './barcelona';
export * from './lasVegas';
export * from './mexico';
export * from './monaco';
export * from './monza';
export * from './saoPaulo';
export * from './singapore';
export * from './testTrack';

/**
 * The game's circuits, the real F1 ones, in menu order: offered in every mode, single player and
 * online (one room list on the server), and drawn with a starting grid. Add a new circuit here
 * (01_docs/circuits.md). Monaco, São Paulo and Baku have their real heights (Phase 3,
 * 01_docs/elevation.md). The Test Ring (`TEST_TRACK`) is only the tests' fixture, never offered.
 */
export const GP_TRACKS: readonly TrackDefinition[] = [
  MONZA,
  BARCELONA,
  MONACO,
  MEXICO,
  SINGAPORE,
  LAS_VEGAS,
  SAO_PAULO,
  BAKU,
];
