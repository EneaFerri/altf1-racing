import GUI from 'lil-gui';
import { CAR_PARAMS, type CarParams } from '@altf1/shared';

type Range = readonly [min: number, max: number, step: number];

/** Slider ranges per parameter, grouped as they appear in the panel. */
const GROUPS: Record<string, Partial<Record<keyof CarParams, Range>>> = {
  'Engine & brakes': {
    maxSpeed: [20, 120, 1],
    engineAccel: [4, 40, 0.5],
    brakeDecel: [5, 60, 1],
    reverseAccel: [1, 20, 0.5],
    maxReverseSpeed: [2, 25, 0.5],
    coastDecel: [0, 6, 0.1],
    airDrag: [0, 0.003, 0.0001],
  },
  'Steering & grip': {
    steerSpeed: [1, 12, 0.1],
    steerReturnSpeed: [1, 15, 0.1],
    maxYawRate: [0.5, 4, 0.05],
    fullTurnSpeed: [1, 20, 0.5],
    highSpeedSteerLoss: [0, 1, 0.05],
    lateralGrip: [0.5, 20, 0.1],
  },
  Drift: {
    handbrakeDecel: [0, 20, 0.5],
    driftMinSpeed: [3, 40, 0.5],
    driftExitSpeed: [1, 30, 0.5],
    driftTurnRate: [0.3, 4, 0.05],
    driftSteerInfluence: [0, 1, 0.05],
    driftAngle: [0, 1.2, 0.01],
    driftAngleSteerRange: [0, 0.8, 0.01],
    driftRotateStiffness: [1, 20, 0.5],
    driftDrag: [0, 10, 0.1],
    driftExitGrip: [0, 10, 0.1],
    driftRecoveryTime: [0.05, 2, 0.05],
  },
};

/**
 * Dev-only live tuning (F2). Mutates the `params` object the Game feeds to the simulation,
 * so changes apply on the next tick. Loaded via dynamic import only when import.meta.env.DEV.
 */
export class TuningPanel {
  private readonly gui = new GUI({ title: 'Car tuning (F2)', width: 320 });

  constructor(private readonly params: CarParams) {
    for (const [title, ranges] of Object.entries(GROUPS)) {
      const folder = this.gui.addFolder(title);
      for (const [key, [min, max, step]] of Object.entries(ranges) as [keyof CarParams, Range][]) {
        folder.add(params, key, min, max, step);
      }
    }
    this.gui.add({ copy: () => this.copyAsCode() }, 'copy').name('Copy as code');
    this.gui.add({ reset: () => this.reset() }, 'reset').name('Reset to defaults');
    this.gui.hide();
  }

  toggle(): void {
    this.gui.show(this.gui._hidden);
  }

  private reset(): void {
    Object.assign(this.params, CAR_PARAMS);
    for (const controller of this.gui.controllersRecursive()) controller.updateDisplay();
  }

  /** Copies the current values as a ready-to-paste `CAR_PARAMS` for config/car.ts. */
  private copyAsCode(): void {
    const lines = Object.entries(this.params).map(
      ([key, value]) => `  ${key}: ${Number((value as number).toFixed(4))},`,
    );
    const code = `export const CAR_PARAMS: CarParams = {\n${lines.join('\n')}\n};\n`;
    // The clipboard API needs a secure context (localhost is fine, a Tailscale IP over http is not).
    console.info(code);
    navigator.clipboard?.writeText(code).catch(() => {});
  }
}
