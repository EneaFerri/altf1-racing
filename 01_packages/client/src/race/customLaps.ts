import { GRAND_PRIX } from '@altf1/shared';

/**
 * The Grand Prix manager's own race distance on the grid (both modes): none until key 4 opens it
 * (at `GRAND_PRIX.customLaps.start`), then ←/→ move it within `min`–`max`; Enter starts the race
 * over it. Plain state, no keys bound here.
 */
export class CustomLaps {
  /** The distance chosen so far (laps); null = not opened. */
  value: number | null = null;

  /** Key 4: opens the choice (kept if already open). */
  open(): void {
    this.value ??= GRAND_PRIX.customLaps.start;
  }

  /** ←/→: one lap fewer (`-1`) or more (`1`), within the limits; nothing if not open. */
  step(by: -1 | 1): void {
    if (this.value === null) return;
    const { min, max } = GRAND_PRIX.customLaps;
    this.value = Math.min(max, Math.max(min, this.value + by));
  }

  /** A new grid starts from the presets. */
  reset(): void {
    this.value = null;
  }
}
