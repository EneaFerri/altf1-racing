import { TICK_RATE, type GameState } from '@altf1/shared';

/**
 * How far behind the newest snapshot the picture runs (ticks). 4 = ~67 ms = two snapshot gaps at
 * 30 Hz, so one late snapshot never stalls the cars. See 01_docs/multiplayer.md#online-race.
 */
export const DELAY_TICKS = 4;
/** Snapshots kept (~1 s at 30 Hz): plenty for the delay above. */
const HISTORY = 30;
/** Farther than this from its target (ticks), the render clock jumps instead of easing. */
const SNAP_TICKS = 30;
/** How quickly small clock drift is corrected (1/s). */
const CORRECTION_RATE = 2;

export interface SnapshotSample {
  readonly prev: GameState;
  readonly curr: GameState;
  /** 0..1, how far the picture is from `prev` to `curr`. */
  readonly alpha: number;
}

/**
 * Plays the server's snapshots back smoothly: a render clock (in ticks) runs at real time, a little
 * behind the newest snapshot, and the picture interpolates between the two snapshots around it.
 * Pure: time only comes in through `advance`.
 */
export class SnapshotBuffer {
  private readonly snapshots: GameState[] = [];
  /** Server tick being drawn (fractional); null until the first snapshot. */
  private clock: number | null = null;

  push(state: GameState): void {
    const newest = this.snapshots.at(-1);
    if (newest && state.tick <= newest.tick) return;
    this.snapshots.push(state);
    if (this.snapshots.length > HISTORY) this.snapshots.shift();
  }

  /** Moves the render clock on by `seconds` of real time, easing it towards its target. */
  advance(seconds: number): void {
    const newest = this.snapshots.at(-1);
    if (!newest) return;
    const target = newest.tick - DELAY_TICKS;
    if (this.clock === null || Math.abs(this.clock + seconds * TICK_RATE - target) > SNAP_TICKS) {
      this.clock = target;
      return;
    }
    this.clock += seconds * TICK_RATE;
    this.clock += (target - this.clock) * Math.min(1, seconds * CORRECTION_RATE);
  }

  /** The current tick drawn by the render clock (null before the first snapshot). */
  get renderTick(): number | null {
    return this.clock;
  }

  /** The two snapshots around the render clock; clamped to the buffer's ends (no extrapolation). */
  sample(): SnapshotSample | null {
    if (this.clock === null || this.snapshots.length === 0) return null;
    const clock = this.clock;
    const first = this.snapshots[0]!;
    if (clock <= first.tick) return { prev: first, curr: first, alpha: 0 };
    for (let i = 1; i < this.snapshots.length; i++) {
      const curr = this.snapshots[i]!;
      if (clock < curr.tick) {
        const prev = this.snapshots[i - 1]!;
        return { prev, curr, alpha: (clock - prev.tick) / (curr.tick - prev.tick) };
      }
    }
    const newest = this.snapshots.at(-1)!;
    return { prev: newest, curr: newest, alpha: 0 };
  }
}
