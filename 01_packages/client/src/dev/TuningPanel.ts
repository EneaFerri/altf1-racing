import GUI from 'lil-gui';
import {
  CAR_PARAMS,
  COLLISION_PARAMS,
  SURFACE_PARAMS,
  type CarParams,
  type CollisionParams,
  type Surface,
  type SurfaceParams,
} from '@altf1/shared';

type Range = readonly [min: number, max: number, step: number];

/** Slider ranges per car parameter, grouped as they appear in the panel. */
const CAR_GROUPS: Record<string, Partial<Record<keyof CarParams, Range>>> = {
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
    yawResponse: [1, 30, 0.5],
    fullTurnSpeed: [1, 20, 0.5],
    highSpeedSteerLoss: [0, 1, 0.05],
    lateralGrip: [0.5, 20, 0.1],
    spinDamping: [0.5, 12, 0.1],
  },
  Drift: {
    handbrakeDecel: [0, 20, 0.5],
    driftMinSpeed: [3, 40, 0.5],
    driftExitSpeed: [1, 30, 0.5],
    driftTurnRate: [0.3, 4, 0.05],
    driftTurnResponse: [0.5, 20, 0.5],
    driftSteerInfluence: [0, 1, 0.05],
    driftAngle: [0, 1.2, 0.01],
    driftAngleSteerRange: [0, 0.8, 0.01],
    driftRotateStiffness: [1, 20, 0.5],
    driftDrag: [0, 10, 0.1],
    driftExitGrip: [0, 10, 0.1],
    driftRecoveryTime: [0.05, 2, 0.05],
  },
};

const COLLISION_RANGES: Record<keyof CollisionParams, Range> = {
  wallRestitution: [0, 1, 0.01],
  wallFriction: [0, 1, 0.01],
  wallAlignSpin: [0, 12, 0.1],
  maxAlignSpin: [0, 6, 0.1],
  carRestitution: [0, 1, 0.01],
  carFriction: [0, 1, 0.01],
  carSpinScale: [0, 1.5, 0.05],
  carSpinMinImpact: [0, 15, 0.5],
  maxImpactSpin: [0, 4, 0.05],
  driftBreakImpactSpeed: [0, 30, 0.5],
  solverIterations: [1, 8, 1],
};

const SURFACE_RANGES: Record<keyof SurfaceParams, Range> = {
  grip: [0, 1.5, 0.01],
  traction: [0, 1.5, 0.01],
  drag: [0, 30, 0.5],
  bumpSpin: [0, 3, 0.05],
};

/**
 * Dev-only live tuning (F2). Mutates the params objects the Game feeds to the simulation,
 * so changes apply on the next tick. Loaded via dynamic import only when import.meta.env.DEV.
 */
export class TuningPanel {
  private readonly gui = new GUI({ title: 'Tuning (F2)', width: 320 });

  constructor(
    private readonly carParams: CarParams,
    private readonly surfaceParams: Record<Surface, SurfaceParams>,
    private readonly collisionParams: CollisionParams,
  ) {
    for (const [title, ranges] of Object.entries(CAR_GROUPS)) {
      const folder = this.gui.addFolder(title);
      for (const [key, [min, max, step]] of Object.entries(ranges) as [keyof CarParams, Range][]) {
        folder.add(carParams, key, min, max, step);
      }
    }

    const collisions = this.gui.addFolder('Collisions');
    for (const [key, [min, max, step]] of Object.entries(COLLISION_RANGES) as [
      keyof CollisionParams,
      Range,
    ][]) {
      collisions.add(collisionParams, key, min, max, step);
    }

    const surfaces = this.gui.addFolder('Surfaces');
    for (const [surface, params] of Object.entries(surfaceParams)) {
      const folder = surfaces.addFolder(surface).close();
      for (const [key, [min, max, step]] of Object.entries(SURFACE_RANGES) as [
        keyof SurfaceParams,
        Range,
      ][]) {
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
    Object.assign(this.carParams, CAR_PARAMS);
    Object.assign(this.collisionParams, COLLISION_PARAMS);
    for (const [surface, params] of Object.entries(SURFACE_PARAMS)) {
      Object.assign(this.surfaceParams[surface as Surface], params);
    }
    for (const controller of this.gui.controllersRecursive()) controller.updateDisplay();
  }

  /** Copies the current values as ready-to-paste code for config/car.ts, collision.ts and surfaces.ts. */
  private copyAsCode(): void {
    const round = (value: number): number => Number(value.toFixed(4));
    const carLines = Object.entries(this.carParams).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const collisionLines = Object.entries(this.collisionParams).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const surfaceLines = Object.entries(this.surfaceParams).map(
      ([surface, p]) =>
        `  ${surface}: { grip: ${round(p.grip)}, traction: ${round(p.traction)}, drag: ${round(p.drag)}, bumpSpin: ${round(p.bumpSpin)} },`,
    );
    const code = [
      '// config/car.ts',
      `export const CAR_PARAMS: CarParams = {\n${carLines.join('\n')}\n};`,
      '',
      '// config/collision.ts',
      `export const COLLISION_PARAMS: CollisionParams = {\n${collisionLines.join('\n')}\n};`,
      '',
      '// config/surfaces.ts',
      `export const SURFACE_PARAMS: Record<Surface, SurfaceParams> = {\n${surfaceLines.join('\n')}\n};`,
      '',
    ].join('\n');
    // The clipboard API needs a secure context (localhost is fine, a Tailscale IP over http is not).
    console.info(code);
    navigator.clipboard?.writeText(code).catch(() => {});
  }
}
