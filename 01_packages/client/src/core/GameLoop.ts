import { FIXED_DT } from '@altf1/shared';

/** Longest frame we simulate; after a freeze (tab switch, breakpoint) we skip time instead of catching up forever. */
export const MAX_FRAME_SECONDS = 0.25;

/** Absorbs floating-point error so N frames of exactly FIXED_DT always produce N ticks. */
const EPSILON = 1e-9;

export interface LoopCallbacks {
  /** Advance the simulation by one fixed tick. */
  tick(): void;
  /**
   * Draw a frame. `alpha` (0..1) is how far we are between the last two ticks, for interpolation;
   * `frameSeconds` is the real time since the previous frame, for purely visual smoothing (e.g. cameras).
   */
  render(alpha: number, frameSeconds: number): void;
}

/**
 * Fixed-timestep loop: the simulation always ticks at TICK_RATE,
 * while rendering runs at whatever rate the display allows.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTimeMs: number | null = null;

  constructor(
    private readonly callbacks: LoopCallbacks,
    private readonly stepSeconds = FIXED_DT,
  ) {}

  /** Feeds one frame of real time into the loop. Returns how many ticks were run. */
  advance(frameSeconds: number): number {
    const clampedSeconds = Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
    this.accumulator += clampedSeconds;

    let ticks = 0;
    while (this.accumulator >= this.stepSeconds - EPSILON) {
      this.callbacks.tick();
      this.accumulator -= this.stepSeconds;
      ticks++;
    }

    const alpha = Math.min(Math.max(this.accumulator / this.stepSeconds, 0), 1);
    this.callbacks.render(alpha, clampedSeconds);
    return ticks;
  }

  start(): void {
    const onFrame = (timeMs: number): void => {
      const frameSeconds = this.lastTimeMs === null ? 0 : (timeMs - this.lastTimeMs) / 1000;
      this.lastTimeMs = timeMs;
      this.advance(frameSeconds);
      requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
  }
}
