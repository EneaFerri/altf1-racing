import GUI from 'lil-gui';
import {
  BOT_PARAMS,
  CAR_PARAMS,
  COLLISION_PARAMS,
  DAMAGE_PARAMS,
  SLIPSTREAM_PARAMS,
  SLOPE_PARAMS,
  SURFACE_PARAMS,
  tuningLabel,
  WET_PARAMS,
  type BotLevel,
  type BotParams,
  type CarDamage,
  type CarParams,
  type CollisionParams,
  type DamageParams,
  type SlipstreamParams,
  type SlopeParams,
  type Surface,
  type SurfaceParams,
  type WetParams,
} from '@altf1/shared';
import { CAMERA_PARAMS, type CameraParams } from '../view/cameras/params';
import { RAINDROP_PARAMS, type RaindropParams } from '../view/weather/Raindrops';

type Range = readonly [min: number, max: number, step: number];

/** Slider ranges per car parameter, grouped as they appear in the panel. */
const CAR_GROUPS: Record<string, Partial<Record<keyof CarParams, Range>>> = {
  'Engine & brakes': {
    maxSpeed: [20, 120, 1],
    engineAccel: [4, 40, 0.5],
    brakeDecel: [5, 60, 1],
    brakeInitialPressure: [0, 1, 0.05],
    brakeRampTime: [0, 2, 0.05],
    brakeReleaseTime: [0, 1, 0.02],
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
  solverIterations: [1, 8, 1],
};

const SLIPSTREAM_RANGES: Record<keyof SlipstreamParams, Range> = {
  range: [5, 100, 1],
  fullGap: [3, 20, 0.5],
  halfWidth: [0.5, 8, 0.1],
  maxHeadingDiff: [0, 1.5, 0.05],
  minSpeed: [0, 60, 1],
  fullSpeed: [10, 95, 1],
  dragCut: [0, 1, 0.05],
  towAccel: [0, 6, 0.1],
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
  performance: [0.9, 1.15, 0.01],
};

/** Slider ranges of the damage params: impacts and off track, then the effects. */
const DAMAGE_RANGES: Record<keyof DamageParams, Range> = {
  impactThreshold: [0, 20, 0.5],
  impactDamage: [0, 0.1, 0.005],
  endTyreShare: [0, 1, 0.05],
  sideTyreShare: [0, 1, 0.05],
  frontZone: [0, 2.8, 0.1],
  rearZone: [0, 2.4, 0.1],
  grassDamage: [0, 0.3, 0.01],
  gravelDamage: [0, 0.5, 0.01],
  offTrackSpeed: [1, 95, 1],
  frontWingSpeedLoss: [0, 0.5, 0.01],
  frontWingTurnLoss: [0, 0.8, 0.01],
  frontWingGripLoss: [0, 0.8, 0.01],
  rearWingSpeedLoss: [0, 0.5, 0.01],
  rearWingTurnLoss: [0, 0.8, 0.01],
  rearWingGripLoss: [0, 0.8, 0.01],
  tyreSpeedLoss: [0, 0.5, 0.01],
  tyreTurnLoss: [0, 0.8, 0.01],
  tyreGripLoss: [0, 0.8, 0.01],
  tyrePull: [0, 0.5, 0.01],
  minSpeed: [0.3, 1, 0.01],
  minTurn: [0.3, 1, 0.01],
  minGrip: [0.3, 1, 0.01],
  punctureDamage: [0.3, 1, 0.01],
  punctureWear: [0.5, 1, 0.01],
  punctureTopSpeed: [10, 95, 0.5],
  punctureDecel: [0, 40, 1],
  punctureGrip: [0.2, 1, 0.01],
  punctureTurn: [0.2, 1, 0.01],
  puncturePull: [0, 0.5, 0.01],
};

/** What the panel needs to try the Grand Prix's damage in single player. */
export interface DevDamage {
  /** The live damage params (edited in place, like every other group). */
  readonly params: DamageParams;
  /** Damage on or off for every car; off repairs them. */
  readonly setEnabled: (on: boolean) => void;
  /** Sets the player's damage directly. */
  readonly setPlayerDamage: (damage: CarDamage) => void;
}

/** The Grand Prix's drivable pit lane in single player: on or off (the page reloads). */
export interface DevPitLane {
  readonly on: boolean;
  readonly set: (on: boolean) => void;
}

/** The rain in single player (a Grand Prix's weather, tried here): on or off, live, and its params. */
export interface DevWeather {
  readonly on: boolean;
  readonly set: (rain: boolean) => void;
  /** The live wet params (edited in place, like every other group). */
  readonly params: WetParams;
  /** How the falling rain looks, live (but the count). */
  readonly drops: RaindropParams;
}

/** Slider ranges of the falling rain's look. */
const RAINDROP_RANGES: Record<Exclude<keyof RaindropParams, 'count'>, Range> = {
  width: [20, 120, 1],
  height: [10, 60, 1],
  below: [0, 20, 0.5],
  speed: [5, 40, 0.5],
  windX: [-0.5, 0.5, 0.01],
  windZ: [-0.5, 0.5, 0.01],
  length: [0.2, 3, 0.05],
  opacity: [0, 1, 0.01],
  nearClear: [0, 15, 0.5],
  fadeIn: [0, 20, 0.5],
};

/** Slider ranges of the wet params. */
const WET_RANGES: Record<keyof WetParams, Range> = {
  grip: [0.3, 1, 0.01],
  traction: [0.3, 1, 0.01],
  brake: [0.3, 1, 0.01],
  puddleGrip: [0.1, 1, 0.01],
  puddleTraction: [0.1, 1, 0.01],
  puddleDrag: [0, 10, 0.1],
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
    private readonly slipstreamParams: SlipstreamParams,
    private readonly slopeParams: SlopeParams,
    private readonly cameraParams: CameraParams,
    private readonly botParams: Record<BotLevel, BotParams>,
    private readonly damage: DevDamage,
    pitLane: DevPitLane,
    private readonly weather: DevWeather,
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

    const slipstream = this.gui.addFolder('Slipstream').close();
    for (const [key, [min, max, step]] of Object.entries(SLIPSTREAM_RANGES) as [
      keyof SlipstreamParams,
      Range,
    ][]) {
      slipstream.add(slipstreamParams, key, min, max, step);
    }

    // Only an elevated track (Monaco) has slopes.
    const slope = this.gui.addFolder('Slope (elevated tracks)').close();
    slope.add(slopeParams, 'factor', 0, 1, 0.05);

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

    this.addDamageFolder();
    this.gui
      .addFolder('Pit lane (Grand Prix)')
      .close()
      .add({ on: pitLane.on }, 'on')
      .name('drivable (reloads)')
      .onChange((on: boolean) => pitLane.set(on));
    const rain = this.gui.addFolder('Weather (Grand Prix)').close();
    rain
      .add({ rain: weather.on }, 'rain')
      .name('rain (or ?rain)')
      .onChange((on: boolean) => weather.set(on));
    for (const [key, [min, max, step]] of Object.entries(WET_RANGES) as [
      keyof WetParams,
      Range,
    ][]) {
      rain.add(weather.params, key, min, max, step);
    }
    const drops = rain.addFolder('Falling rain (look)').close();
    for (const [key, [min, max, step]] of Object.entries(RAINDROP_RANGES) as [
      keyof typeof RAINDROP_RANGES,
      Range,
    ][]) {
      drops.add(weather.drops, key, min, max, step);
    }

    this.gui.add({ copy: () => this.copyAsCode() }, 'copy').name('Copy as code');
    this.gui.add({ reset: () => this.reset() }, 'reset').name('Reset to defaults');
    this.gui.hide();
  }

  toggle(): void {
    this.gui.show(this.gui._hidden);
  }

  /**
   * Damage (Grand Prix only, tried here): on/off, the player's parts set by hand (to feel a damage
   * without crashing), a repair, and the params.
   */
  private addDamageFolder(): void {
    const folder = this.gui.addFolder('Damage (Grand Prix)').close();
    folder
      .add({ on: false }, 'on')
      .name('on in single player')
      .onChange((on: boolean) => this.damage.setEnabled(on));
    const parts = { frontWing: 0, rearWing: 0, tyreFL: 0, tyreFR: 0, tyreRL: 0, tyreRR: 0 };
    const apply = (): void =>
      this.damage.setPlayerDamage({
        frontWing: parts.frontWing,
        rearWing: parts.rearWing,
        tyres: [parts.tyreFL, parts.tyreFR, parts.tyreRL, parts.tyreRR],
      });
    const own = folder.addFolder("Player's car (needs on)");
    for (const key of Object.keys(parts) as (keyof typeof parts)[]) {
      own.add(parts, key, 0, 1, 0.05).onChange(apply);
    }
    own
      .add(
        {
          repair: () => {
            for (const key of Object.keys(parts) as (keyof typeof parts)[]) parts[key] = 0;
            for (const controller of own.controllers) controller.updateDisplay();
            apply();
          },
        },
        'repair',
      )
      .name('Repair');
    const params = folder.addFolder('Params').close();
    for (const [key, [min, max, step]] of Object.entries(DAMAGE_RANGES) as [
      keyof DamageParams,
      Range,
    ][]) {
      params.add(this.damage.params, key, min, max, step);
    }
  }

  private reset(): void {
    Object.assign(this.carParams, CAR_PARAMS);
    Object.assign(this.collisionParams, COLLISION_PARAMS);
    Object.assign(this.slipstreamParams, SLIPSTREAM_PARAMS);
    Object.assign(this.slopeParams, SLOPE_PARAMS);
    Object.assign(this.damage.params, DAMAGE_PARAMS);
    Object.assign(this.weather.params, WET_PARAMS);
    Object.assign(this.weather.drops, RAINDROP_PARAMS);
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
    const slipstreamLines = Object.entries(this.slipstreamParams).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const damageLines = Object.entries(this.damage.params).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const wetLines = Object.entries(this.weather.params).map(
      ([key, value]) => `  ${key}: ${round(value as number)},`,
    );
    const dropLines = Object.entries(this.weather.drops).map(
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
        `  ${level}: { cornerSpeed: ${round(p.cornerSpeed)}, brakeUse: ${round(p.brakeUse)}, lineCut: ${round(p.lineCut)}, topSpeed: ${round(p.topSpeed)}, performance: ${round(p.performance)}, shortcuts: ${p.shortcuts} },`,
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
      '// config/slipstream.ts',
      `export const SLIPSTREAM_PARAMS: SlipstreamParams = {\n${slipstreamLines.join('\n')}\n};`,
      '',
      '// config/slope.ts',
      `export const SLOPE_PARAMS: SlopeParams = { gravity: ${round(this.slopeParams.gravity)}, factor: ${round(this.slopeParams.factor)} };`,
      '',
      '// config/damage.ts',
      `export const DAMAGE_PARAMS: DamageParams = {\n${damageLines.join('\n')}\n};`,
      '',
      '// config/weather.ts',
      `export const WET_PARAMS: WetParams = {\n${wetLines.join('\n')}\n};`,
      '',
      '// config/surfaces.ts',
      `export const SURFACE_PARAMS: Record<Surface, SurfaceParams> = {\n${surfaceLines.join('\n')}\n};`,
      '',
      '// config/bot.ts',
      `export const BOT_PARAMS: Record<BotLevel, BotParams> = {\n${botLines.join('\n')}\n};`,
      '',
      '// client: view/weather/Raindrops.ts',
      `export const RAINDROP_PARAMS: RaindropParams = {\n${dropLines.join('\n')}\n};`,
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
