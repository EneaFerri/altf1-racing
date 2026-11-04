import type { GrandPrixPhase } from '../net/protocol';

/**
 * Whether cars take damage in a Grand Prix's `phase` (Phase 4, 01_docs/damage.md): in qualifying
 * and the race only, never in the lobby, on the waiting grid or in the results. The server's room
 * and the client's prediction both follow it.
 */
export function damageInPhase(phase: GrandPrixPhase): boolean {
  return phase === 'qualifying' || phase === 'race';
}
