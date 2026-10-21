import type { GameState, InputCommand } from '@altf1/shared';

const REFRESH_MS = 500;

/** Developer overlay (F3): simulation tick, measured TPS/FPS and the current input. */
export class DebugOverlay {
  private readonly element = document.createElement('pre');
  private frames = 0;
  private windowStartMs = performance.now();
  private windowStartTick = 0;
  private fps = 0;
  private tps = 0;

  constructor(visible = import.meta.env.DEV) {
    Object.assign(this.element.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      margin: '0',
      padding: '6px 8px',
      font: '12px/1.4 monospace',
      color: '#fff',
      background: 'rgba(0, 0, 0, 0.6)',
      pointerEvents: 'none',
    });
    this.element.hidden = !visible;
    document.body.appendChild(this.element);
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
  }

  /** Call once per rendered frame. */
  update(state: GameState, input: InputCommand): void {
    this.frames++;
    const now = performance.now();
    const elapsedMs = now - this.windowStartMs;
    if (elapsedMs >= REFRESH_MS) {
      this.fps = (this.frames * 1000) / elapsedMs;
      this.tps = ((state.tick - this.windowStartTick) * 1000) / elapsedMs;
      this.frames = 0;
      this.windowStartMs = now;
      this.windowStartTick = state.tick;
    }
    if (this.element.hidden) return;

    this.element.textContent = [
      `tick      ${state.tick}`,
      `tps       ${this.tps.toFixed(1)}`,
      `fps       ${this.fps.toFixed(0)}`,
      `throttle  ${input.throttle}`,
      `brake     ${input.brake}`,
      `steer     ${input.steer}`,
      `handbrake ${input.handbrake ? 'ON' : 'off'}`,
      '',
      'F3 toggle',
    ].join('\n');
  }
}
