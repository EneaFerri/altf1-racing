import GUI from 'lil-gui';
import {
  BOT_PARAMS,
  CAR_PARAMS,
  COLLISION_PARAMS,
  SURFACE_PARAMS,
  tuningLabel,
  type BotLevel,
  type BotParams,
  type CarParams,
  type CollisionParams,
  type Surface,
  type SurfaceParams,
} from '@altf1/shared';
import { CAMERA_PARAMS, type CameraParams } from '../view/cameras/params';

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

const CAMERA_GROUPS: Record<string, Partial<Record<keyof CameraParams, Range>>> = {
  Chase: {
    distance: [2, 20, 0.1],
    height: [0.5, 10, 0.1],
    lookAhead: [-5, 20, 0.1],
    lookHeight: [0, 5, 0.1],
    yawStiffness: [0.5, 30, 0.5],
    fov: [40, 110, 1],
  },
  'First person': {
    eyeAhead: [-2, 2, 0.05],
    eyeHeight: [0.4, 2, 0.05],
    pitch: [-0.4, 0.2, 0.01],
    povFov: [40, 120, 1],
  },
  'Speed FOV': {
    fovSpeedGain: [0, 30, 0.5],
    fovSpeedRef: [10, 90, 1],
    fovStiffness: [0.5, 20, 0.5],
  },
};

const SURFACE_RANGES: Record<keyof SurfaceParams, Range> = {
  grip: [0, 1.5, 0.01],
  traction: [0, 1.5, 0.01],
  drag: [0, 30, 0.5],
  bumpSpin: [0, 3, 0.05],
};

/** Numeric bot params get a slider; `shortcuts` is a checkbox. */
const BOT_RANGES: Record<Exclude<keyof BotParams, 'shortcuts'>, Range> = {
  cornerSpeed: [0.3, 1.6, 0.01],
  brakeUse: [0.2, 1.3, 0.01],
  lineCut: [0, 1, 0.05],
  topSpeed: [0.4, 1, 0.01],
  driftUse: [0, 1.5, 0.05],
  performance: [0.9, 1.15, 0.01],
};

/**
 * Dev-only live tuning (F2). Mutates the params objects the Game feeds to the simulation,
 * so changes apply on the next tick. Loaded via dynamic import only when import.meta.env.DEV.
 */
export class TuningPanel {
  private readonly gui = new GUI({ title: `Tuning (F2) · ${tuningLabel()}`, width: 320 });

  constructor(
    private readonly carParams: CarParams,
    private readonly surfaceParams: Record<Surface, SurfaceParams>,
    private readonly collisionParams: CollisionParams,
    private readonly cameraParams: CameraParams,
    private readonly botParams: Record<BotLevel, BotParams>,
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

    const camera = this.gui.addFolder('Camera').close();
    for (const [title, ranges] of Object.entries(CAMERA_GROUPS)) {
      const folder = camera.addFolder(title);
      for (const [key, [min, max, step]] of Object.entries(ranges) as [
        keyof CameraParams,
        Range,
      ][]) {
        folder.add(cameraParams, key, min, max, step);
      }
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

    const bot = this.gui.addFolder('Bot').close();
    for (const [level, params] of Object.entries(botParams)) {
      const folder = bot.addFolder(level).close();
      for (const [key, [min, max, step]] of Object.entries(BOT_RANGES) as [
        keyof typeof BOT_RANGES,
        Range,
      ][]) {
        folder.add(params, key, min, max, step);
      }
      folder.add(params, 'shortcuts');
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
    Object.assign(this.cameraParams, CAMERA_PARAMS);
    for (const [surface, params] of Object.entries(SURFACE_PARAMS)) {
      Object.assign(this.surfaceParams[surface as Surface], params);
    }
    for (const [level, params] of Object.entries(BOT_PARAMS)) {
      Object.assign(this.botParams[level as BotLevel], params);
    }
    for (const controller of this.gui.controllersRecursive()) controller.updateDisplay();
  }

  /** Copies the current values as ready-to-paste code for the config files and the camera params. */
  private copyAsCode(): void {
    const round = (value: number): number => Number(value.toFixed(4));
    const carLines = Object.entries(this.carParams).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const collisionLines = Object.entries(this.collisionParams).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const cameraLines = Object.entries(this.cameraParams).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const surfaceLines = Object.entries(this.surfaceParams).map(
      ([surface, p]) =>
        `  ${surface}: { grip: ${round(p.grip)}, traction: ${round(p.traction)}, drag: ${round(p.drag)}, bumpSpin: ${round(p.bumpSpin)} },`,
    );
    const botLines = Object.entries(this.botParams).map(
      ([level, p]) =>
        `  ${level}: { cornerSpeed: ${round(p.cornerSpeed)}, brakeUse: ${round(p.brakeUse)}, lineCut: ${round(p.lineCut)}, topSpeed: ${round(p.topSpeed)}, driftUse: ${round(p.driftUse)}, performance: ${round(p.performance)}, shortcuts: ${p.shortcuts} },`,
    );
    const code = [
      `// From ${tuningLabel()}. When freezing: bump TUNING_BASELINE in config/tuning.ts (01_docs/tuning.md).`,
      '',
      '// config/car.ts',
      `export const CAR_PARAMS: CarParams = {\n${carLines.join('\n')}\n};`,
      '',
      '// config/collision.ts',
      `export const COLLISION_PARAMS: CollisionParams = {\n${collisionLines.join('\n')}\n};`,
      '',
      '// config/surfaces.ts',
      `export const SURFACE_PARAMS: Record<Surface, SurfaceParams> = {\n${surfaceLines.join('\n')}\n};`,
      '',
      '// config/bot.ts',
      `export const BOT_PARAMS: Record<BotLevel, BotParams> = {\n${botLines.join('\n')}\n};`,
      '',
      '// client: view/cameras/params.ts',
      `export const CAMERA_PARAMS: CameraParams = {\n${cameraLines.join('\n')}\n};`,
      '',
    ].join('\n');
    // The clipboard API needs a secure context (localhost is fine, a Tailscale IP over http is not).
    console.info(code);
    navigator.clipboard?.writeText(code).catch(() => {});
  }
}
