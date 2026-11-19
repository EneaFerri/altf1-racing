import {
  BOT_LEVELS,
  BOT_PARAMS,
  botInput,
  botCarParams,
  buildBotPlan,
  buildTrack,
  CAR_PARAMS,
  COLLISION_PARAMS,
  SLIPSTREAM_PARAMS,
  SLOPE_PARAMS,
  createGame,
  DAMAGE_PARAMS,
  PIT_PARAMS,
  findCar,
  findLap,
  placePuddles,
  puddleShare,
  WET_PARAMS,
  NEUTRAL_INPUT,
  NEW_BOT_MEMORY,
  placeCar,
  removeCar,
  repairCars,
  stepGame,
  SURFACE_PARAMS,
  type BotLevel,
  type BotParams,
  type BotPlan,
  type CarDamage,
  type CarId,
  type CarParams,
  type GameState,
  type InputCommand,
  type SimContext,
  type Surface,
  type SurfaceParams,
  type Track,
  type TrackDefinition,
  type Weather,
} from '@altf1/shared';
import { KeyboardController } from '../controller/KeyboardController';
import { CAMERA_PARAMS } from '../view/cameras/params';
import { DebugOverlay } from '../view/hud/DebugOverlay';
import { Hud } from '../view/hud/Hud';
import { Minimap } from '../view/hud/Minimap';
import { LIVERIES } from '../view/pixelTexture';
import { SceneView } from '../view/SceneView';
import type { TrackTheme } from '../view/themes/theme';
import { GameLoop } from '../core/GameLoop';
import { Ghost } from './ghost';
import type { LocalRecords } from './localRecords';

/**
 * Single player's modes: free practice (alone), time trial (alone, with the ghost of the own best
 * lap and this browser's records) and test (the bot, telemetry open, the dev tools in dev).
 */
export type SinglePlayerMode = 'practice' | 'timeTrial' | 'test';

/** Id of the car driven by this machine's keyboard. */
const PLAYER_ID = 'player';
/** The local bot opponent (B cycles its level). */
const BOT_ID = 'bot';
/** Level at start. */
const START_BOT_LEVEL: BotLevel = 'medium';
/** A bot switched back on appears at rest this far behind the player (m), never on top of them. */
const BOT_RESPAWN_DISTANCE = -40;
/** Dev-only parked car to crash into (F4 brings it in front of the player). */
const DUMMY_ID = 'dummy';
/** How far ahead of the player F4 parks the dummy (m). */
const DUMMY_DISTANCE = 25;
/**
 * Dev only: `?pitlane` in the URL builds a real circuit with its drivable pit lane, the Grand
 * Prix's (F2 → Pit lane sets it and reloads).
 */
const PIT_LANE_PARAM = 'pitlane';
/** Dev only: `?rain` in the URL starts in the rain (F2 → Weather switches it live). */
const RAIN_PARAM = 'rain';

/** Wires Model, View and Controller together and drives them with the game loop. */
export class SinglePlayerGame {
  private readonly track: Track;
  private readonly trackName: string;
  private state: GameState;
  /** State before the last tick, kept so the View can interpolate between the two. */
  private prevState: GameState;
  private lastInput: InputCommand = NEUTRAL_INPUT;
  /** Null = bot switched off (always, outside test mode). */
  private botLevel: BotLevel | null;
  /** Time trial only: the own best lap, raced as a see-through car. */
  private readonly ghost: Ghost | null;
  /** Time trial only: this browser's best lap per circuit. */
  private readonly records: LocalRecords | null;
  /** Laps the player had completed after the last tick (to spot a lap just finished). */
  private playerLaps = 0;
  private botMemory = NEW_BOT_MEMORY;
  /** The bot's plan and the params it was built from; rebuilt when the level or any tuning changes. */
  private botPlan: { readonly key: string; readonly plan: BotPlan } | null = null;
  /** Live tuning values fed to the simulation; the dev tuning panel edits these copies. */
  private readonly carParams: CarParams = { ...CAR_PARAMS };
  private readonly surfaceParams = copySurfaceParams();
  private readonly collisionParams = { ...COLLISION_PARAMS };
  private readonly slipstreamParams = { ...SLIPSTREAM_PARAMS };
  private readonly slopeParams = { ...SLOPE_PARAMS };
  /** Damage is the Grand Prix's: here only through the dev panel (F2 → Damage), to try it. */
  private readonly damageParams = { ...DAMAGE_PARAMS };
  /** Rain is the Grand Prix's: here only through the dev panel (F2 → Weather, `?rain`). */
  private readonly wetParams = { ...WET_PARAMS };
  private readonly cameraParams = { ...CAMERA_PARAMS };
  private readonly botParams = copyBotParams();
  /** Cars that drive a different car than the player's: the bot's, with its level's performance. */
  private readonly carParamsById: Record<CarId, CarParams> = {};
  private ctx: SimContext;

  private readonly controller = new KeyboardController();
  private readonly view: SceneView;
  private readonly hud = new Hud();
  private readonly minimap: Minimap;
  /** F3 telemetry: open from the start in test mode, else as online (open in dev). */
  private readonly debugOverlay: DebugOverlay;
  private readonly loop = new GameLoop({
    tick: () => this.tick(),
    render: (alpha, frameSeconds) => this.render(alpha, frameSeconds),
  });

  constructor(
    definition: TrackDefinition,
    theme: TrackTheme,
    mode: SinglePlayerMode,
    records: LocalRecords,
  ) {
    const test = mode === 'test';
    const devTools = import.meta.env.DEV && test;
    const devPitLane = devTools && new URLSearchParams(location.search).has(PIT_LANE_PARAM);
    this.trackName = definition.name;
    this.track = buildTrack(definition, {
      pitLane: devPitLane && definition.pitLane !== undefined,
    });
    this.botLevel = test ? START_BOT_LEVEL : null;
    this.ghost = mode === 'timeTrial' ? new Ghost(PLAYER_ID) : null;
    this.records = mode === 'timeTrial' ? records : null;
    this.debugOverlay = test ? new DebugOverlay(true) : new DebugOverlay();
    this.state = createGame(
      this.track,
      !test ? [PLAYER_ID] : devTools ? [PLAYER_ID, BOT_ID, DUMMY_ID] : [PLAYER_ID, BOT_ID],
    );
    this.prevState = this.state;
    this.ctx = {
      track: this.track,
      carParams: this.carParams,
      carParamsById: this.carParamsById,
      surfaceParams: this.surfaceParams,
      collisionParams: this.collisionParams,
      slipstreamParams: this.slipstreamParams,
      slopeParams: this.slopeParams,
      // Dev only, with the pit lane: the Grand Prix's pit rules, the player in the first box.
      ...(this.track.routes.some((road) => road.pit) && {
        pit: { params: PIT_PARAMS, boxes: { [PLAYER_ID]: 0 } },
      }),
    };
    this.view = new SceneView(
      this.track,
      PLAYER_ID,
      { [PLAYER_ID]: LIVERIES.red, [BOT_ID]: LIVERIES.blue },
      this.cameraParams,
      theme,
    );
    const devRain = devTools && new URLSearchParams(location.search).has(RAIN_PARAM);
    if (devRain) this.setWeather('rain');
    this.minimap = new Minimap(this.track);
    if (this.ctx.pit) {
      this.hud.usePitLane(this.track);
      this.view.markPitBox(0);
    }
    this.minimap.setPlayers({
      [PLAYER_ID]: { name: 'You', color: LIVERIES.red.body },
      ...(test && {
        [BOT_ID]: { name: 'Bot', color: LIVERIES.blue.body },
        [DUMMY_ID]: { name: 'Dummy', color: LIVERIES.grey.body },
      }),
    });
    this.controller.onAction('toggleDebug', () => this.debugOverlay.toggle());
    this.controller.onAction('toggleCamera', () => this.view.toggleCamera());
    this.controller.onAction('toggleRain', () => this.view.toggleRaindrops());
    // A fresh page load is the simplest full teardown (renderer, listeners, state): nothing to lose yet.
    this.controller.onAction('backToMenu', () => location.reload());
    if (test) {
      this.controller.onAction('cycleBot', () => this.cycleBot());
      this.hud.setBotLevel(this.botLevel);
    } else {
      this.hud.hideBot();
    }
    // Dev tools (and lil-gui) are dynamically imported inside this block so that
    // production builds, where `import.meta.env.DEV` is a constant `false`, drop them entirely.
    if (import.meta.env.DEV && test) {
      void import('../dev/TuningPanel').then(({ TuningPanel }) => {
        const panel = new TuningPanel(
          this.carParams,
          this.surfaceParams,
          this.collisionParams,
          this.slipstreamParams,
          this.slopeParams,
          this.cameraParams,
          this.botParams,
          {
            params: this.damageParams,
            setEnabled: (on) => this.setDamage(on),
            setPlayerDamage: (damage) => this.setPlayerDamage(damage),
          },
          {
            on: devPitLane,
            set: (on) => {
              const url = new URL(location.href);
              if (on) url.searchParams.set(PIT_LANE_PARAM, '');
              else url.searchParams.delete(PIT_LANE_PARAM);
              location.assign(url); // back to the start screen: choose the circuit again
            },
          },
          {
            on: devRain,
            set: (on) => this.setWeather(on ? 'rain' : 'dry'),
            params: this.wetParams,
            drops: this.view.raindropParams,
          },
        );
        this.controller.onAction('toggleTuning', () => panel.toggle());
      });
      this.controller.onAction('placeDummy', () => {
        this.changeCars((state) =>
          placeCar(state, this.track, DUMMY_ID, PLAYER_ID, DUMMY_DISTANCE),
        );
      });
    }
  }

  start(): void {
    this.loop.start();
  }

  private tick(): void {
    this.lastInput = this.controller.sample();
    const inputs: Record<CarId, InputCommand> = { [PLAYER_ID]: this.lastInput };
    const bot = findCar(this.state, BOT_ID);
    if (bot && this.botLevel) {
      const result = botInput(bot, this.currentBotPlan(this.botLevel), this.botMemory);
      this.botMemory = result.memory;
      inputs[BOT_ID] = result.input;
    }
    this.prevState = this.state;
    this.state = stepGame(this.state, inputs, this.ctx);
    if (this.ghost) this.ghost.record(this.state);
    if (this.records) this.submitLap();
  }

  /** Time trial: a valid lap just finished goes to this browser's records (kept if the best). */
  private submitLap(): void {
    const lap = findLap(this.state, PLAYER_ID);
    if (!lap || lap.laps === this.playerLaps) return;
    this.playerLaps = lap.laps;
    if (lap.lastLap?.valid) this.records!.submit(this.trackName, lap.lastLap.ticks);
  }

  /** B: Off → Easy → Medium → Hard → Off. A level change keeps the bot where it is. */
  private cycleBot(): void {
    const next = nextBotLevel(this.botLevel);
    if (this.botLevel === null) {
      this.botMemory = NEW_BOT_MEMORY;
      this.changeCars((state) =>
        placeCar(state, this.track, BOT_ID, PLAYER_ID, BOT_RESPAWN_DISTANCE),
      );
    } else if (next === null) {
      this.changeCars((state) => removeCar(state, BOT_ID));
    }
    this.botLevel = next;
    this.hud.setBotLevel(next);
  }

  /** Dev only (F2 → Damage): the Grand Prix's damage on in single player; off repairs every car. */
  private setDamage(on: boolean): void {
    this.ctx = on ? { ...this.ctx, damage: this.damageParams } : withoutDamage(this.ctx);
    if (!on) this.changeCars(repairCars);
  }

  /**
   * Dev only (F2 → Weather, `?rain`): the weather a Grand Prix's manager can choose, tried here:
   * its look and the wet track (live `wetParams`, the puddles), the bot planning for it
   * (01_docs/weather.md).
   */
  private setWeather(weather: Weather): void {
    const dry = withoutWeather(this.ctx);
    this.ctx =
      weather === 'rain'
        ? { ...dry, weather: { params: this.wetParams, puddles: placePuddles(this.track) } }
        : dry;
    this.view.setWeather(weather);
  }

  /** Dev only (F2 → Damage): sets the player's damage, to feel it without crashing. */
  private setPlayerDamage(damage: CarDamage): void {
    this.changeCars((state) => ({
      ...state,
      cars: state.cars.map((car) => (car.id === PLAYER_ID ? { ...car, damage } : car)),
    }));
  }

  /** Applies a change of cars to both states, so the View never interpolates a car across the map. */
  private changeCars(change: (state: GameState) => GameState): void {
    this.state = change(this.state);
    this.prevState = change(this.prevState);
  }

  private currentBotPlan(level: BotLevel): BotPlan {
    const wet = this.ctx.weather?.params;
    const key = JSON.stringify([
      level,
      this.botParams[level],
      this.carParams,
      this.slopeParams,
      wet,
    ]);
    if (this.botPlan?.key !== key) {
      const params = this.botParams[level];
      this.botPlan = {
        key,
        plan: buildBotPlan(this.track, this.carParams, params, this.slopeParams, wet),
      };
      this.carParamsById[BOT_ID] = botCarParams(this.carParams, params);
    }
    return this.botPlan.plan;
  }

  private render(alpha: number, frameSeconds: number): void {
    this.view.setLookBack(this.controller.isHeld('lookBack'));
    // The ghost runs on the lap's clock, at the same in-between tick as the cars.
    const tick = this.prevState.tick + (this.state.tick - this.prevState.tick) * alpha;
    this.view.setGhost(this.ghost?.frameAt(tick) ?? null);
    this.view.render(this.prevState, this.state, alpha, frameSeconds);
    this.hud.update(this.state, PLAYER_ID, performance.now());
    this.minimap.update(this.state.cars, PLAYER_ID);
    const player = findCar(this.state, PLAYER_ID);
    if (!player) return;
    const { weather } = this.ctx;
    const wet = weather
      ? [`weather   rain · ${puddleShare(player, weather.puddles) * 4}/4 wheels in a puddle`]
      : [];
    this.debugOverlay.update(this.state, player, this.lastInput, wet);
  }
}

/** `ctx` with no damage: what every mode but the Grand Prix runs. */
function withoutDamage({ damage: _damage, ...ctx }: SimContext): SimContext {
  return ctx;
}

/** `ctx` on a dry track: what every mode runs unless the Grand Prix's manager chose the rain. */
function withoutWeather({ weather: _weather, ...ctx }: SimContext): SimContext {
  return ctx;
}

/** Deep copy, so live tuning never edits the defaults in config/surfaces.ts. */
function copySurfaceParams(): Record<Surface, SurfaceParams> {
  return Object.fromEntries(
    Object.entries(SURFACE_PARAMS).map(([surface, params]) => [surface, { ...params }]),
  ) as Record<Surface, SurfaceParams>;
}

/** Deep copy, so live tuning never edits the defaults in config/bot.ts. */
function copyBotParams(): Record<BotLevel, BotParams> {
  return Object.fromEntries(
    Object.entries(BOT_PARAMS).map(([level, params]) => [level, { ...params }]),
  ) as Record<BotLevel, BotParams>;
}

/** The level after `level` in the B cycle; null = off. */
function nextBotLevel(level: BotLevel | null): BotLevel | null {
  if (level === null) return BOT_LEVELS[0]!;
  return BOT_LEVELS[BOT_LEVELS.indexOf(level) + 1] ?? null;
}
