import {
  dot,
  forward,
  length,
  right,
  slipAngle,
  tuningLabel,
  type CarState,
  type GameState,
  type ImpactEvent,
  type Surface,
  type InputCommand,
} from '@altf1/shared';

const REFRESH_MS = 500;

/** Short labels so four wheels fit on one line. Upper case = punishing surfaces (high kerb, grass, gravel). */
const SURFACE_LABEL: Record<Surface, string> = {
  asphalt: 'asp',
  kerb: 'krb',
  highKerb: 'HKB',
  grass: 'GRS',
  gravel: 'GRV',
};

/** Developer overlay (F3): tick, measured TPS/FPS, current input and car telemetry. */
export class DebugOverlay {
  private readonly element = document.createElement('pre');
  private frames = 0;
  private windowStartMs = performance.now();
  private windowStartTick = 0;
  private fps = 0;
  private tps = 0;
  /** Last impact of the inspected car and the tick it happened on. */
  private lastImpact?: { readonly event: ImpactEvent; readonly tick: number };

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

  /** Call once per rendered frame with the car to inspect (usually the player's). */
  update(state: GameState, car: CarState, input: InputCommand): void {
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
    // Sampled per frame: with several ticks in one frame an impact can be missed (debug only).
    const impact = state.impacts.find((e) => e.carId === car.id);
    if (impact) this.lastImpact = { event: impact, tick: state.tick };
    if (this.element.hidden) return;

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
      `drift     ${car.drifting ? `DRIFT ${car.driftDirection > 0 ? 'right' : 'left'}` : 'off'}`,
      `slip      ${((slipAngle(car) * 180) / Math.PI).toFixed(0)}°`,
      `grip      ${(car.gripRecovery * 100).toFixed(0)}%`,
      `spin      ${car.spin.toFixed(2)} rad/s`,
      `wheels    ${car.wheelSurfaces.map((s) => SURFACE_LABEL[s]).join(' ')}  (FL FR RL RR)`,
      `impact    ${this.impactText(state.tick)}`,
      `tuning    ${tuningLabel()}`,
      '',
      `R reset · V camera · B bot · F3 overlay${import.meta.env.DEV ? ' · F2 tuning · F4 dummy' : ''}`,
    ].join('\n');
  }

  private impactText(tick: number): string {
    if (!this.lastImpact) return '-';
    const { event, tick: at } = this.lastImpact;
    return `${event.other} ${event.strength.toFixed(1)} m/s, ${tick - at} ticks ago`;
  }
}
