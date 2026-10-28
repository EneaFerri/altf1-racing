import { findCar, findLap, type CarId, type CarState, type GameState } from '@altf1/shared';
import type { GhostPose } from '../view/SceneView';

/**
 * Time trial's ghost: the own car's best valid lap of the session, replayed in step with the
 * current lap. Records the car at every tick of the lap being driven; when a valid lap ends faster
 * than the ghost (or there is none yet), that recording becomes the ghost. Fed with the predicted
 * world, re-recording a tick the prediction redid. Pure: no view, no clock.
 * See 01_docs/multiplayer.md#modes-23.
 */
export class Ghost {
  /** The best lap: the car at each of its ticks from the start; null before the first valid lap. */
  private best: readonly CarState[] | null = null;
  /** The lap being driven, tick by tick from `lapStart`. */
  private recording: CarState[] = [];
  /** Tick the lap being driven started on; null on the out-lap. */
  private lapStart: number | null = null;
  /** Laps completed when the current lap started. */
  private lapsDone = 0;

  constructor(private readonly carId: CarId) {}

  /** Takes the newest predicted state: records the car, and keeps a finished lap if it's the best. */
  record(state: GameState): void {
    const lap = findLap(state, this.carId);
    const car = findCar(state, this.carId);
    if (!lap || !car) return;
    if (lap.lapStartTick !== this.lapStart) {
      const finished = lap.laps > this.lapsDone ? lap.lastLap : null;
      if (finished?.valid && (!this.best || finished.ticks < this.best.length)) {
        const last = this.recording.at(-1) ?? car;
        while (this.recording.length < finished.ticks) this.recording.push(last);
        this.best = this.recording.slice(0, finished.ticks);
      }
      this.lapStart = lap.lapStartTick;
      this.lapsDone = lap.laps;
      this.recording = [];
    }
    if (this.lapStart === null) return;
    const index = state.tick - this.lapStart;
    if (index < 0) return;
    // A tick the prediction skipped repeats the last one; a tick it redid replaces what followed.
    while (this.recording.length < index) this.recording.push(this.recording.at(-1) ?? car);
    this.recording.length = index;
    this.recording.push(car);
  }

  /**
   * The ghost at (fractional) tick `tick` of the current lap's clock; null on the out-lap, before
   * the first valid lap, and once the ghost has crossed the line (it waits for the next lap).
   */
  frameAt(tick: number): GhostPose | null {
    if (!this.best || this.lapStart === null) return null;
    const t = tick - this.lapStart;
    if (t < 0 || t >= this.best.length) return null;
    const i = Math.floor(t);
    return {
      before: this.best[i]!,
      after: this.best[Math.min(i + 1, this.best.length - 1)]!,
      alpha: t - i,
    };
  }
}
