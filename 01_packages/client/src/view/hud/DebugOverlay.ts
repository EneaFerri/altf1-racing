import { dot, forward, length, right, type GameState, type InputCommand } from '@altf1/shared';

const REFRESH_MS = 500;

/** Developer overlay (F3): tick, measured TPS/FPS, current input and car telemetry. */
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

    const { car } = state;
    const headingDeg = (car.heading * 180) / Math.PI;
    this.element.textContent = [
      `tick      ${state.tick}`,
      `tps       ${this.tps.toFixed(1)}`,
      `fps       ${this.fps.toFixed(0)}`,
      `throttle  ${input.throttle}`,
      `brake     ${input.brake}`,
      `steer     ${input.steer}`,
      `handbrake ${input.handbrake ? 'ON' : 'off'}`,
      '',
      `speed     ${(length(car.velocity) * 3.6).toFixed(0)} km/h`,
      `vF / vL   ${dot(car.velocity, forward(car.heading)).toFixed(1)} / ${dot(car.velocity, right(car.heading)).toFixed(1)} m/s`,
      `heading   ${headingDeg.toFixed(0)}°`,
      `steer     ${car.steer.toFixed(2)} (smoothed)`,
      '',
      'F3 toggle',
    ].join('\n');
  }
}
