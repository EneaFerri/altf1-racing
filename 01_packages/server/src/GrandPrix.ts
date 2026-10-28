import type { CarId, GrandPrixAction, GrandPrixInfo, GrandPrixPhase } from '@altf1/shared';

/**
 * The rules of one circuit's Grand Prix: who manages it and which phase it is in. The first player
 * in is the manager; if they leave, the one who has been there longest takes over. Only the
 * manager's commands count. Pure (the room's simulation is a `Room`).
 * See 01_docs/multiplayer.md#grand-prix.
 */
export class GrandPrix {
  private phase: GrandPrixPhase = 'lobby';
  /** Players in the Grand Prix, in arrival order: the first is the manager. */
  private readonly drivers: CarId[] = [];

  /** Whether newcomers may still enter: only while waiting in the lobby. */
  get isOpen(): boolean {
    return this.phase === 'lobby';
  }

  get info(): GrandPrixInfo {
    return { phase: this.phase, manager: this.drivers[0]! };
  }

  add(id: CarId): void {
    this.drivers.push(id);
  }

  remove(id: CarId): void {
    const index = this.drivers.indexOf(id);
    if (index >= 0) this.drivers.splice(index, 1);
  }

  /** Applies `action` if `id` is the manager and it fits the phase; whether anything changed. */
  command(id: CarId, action: GrandPrixAction): boolean {
    if (id !== this.drivers[0]) return false;
    if (action === 'start' && this.phase === 'lobby') {
      this.phase = 'qualifying';
      return true;
    }
    return false;
  }
}
