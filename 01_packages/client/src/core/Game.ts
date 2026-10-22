import {
  BOT_LEVELS,
  BOT_PARAMS,
  botInput,
  botCarParams,
  buildBotPlan,
  buildTrack,
  CAR_PARAMS,
  COLLISION_PARAMS,
  createGame,
  findCar,
  NEUTRAL_INPUT,
  NEW_BOT_MEMORY,
  placeCar,
  removeCar,
  stepGame,
  SURFACE_PARAMS,
  type BotLevel,
  type BotParams,
  type BotPlan,
  type CarId,
  type CarParams,
  type GameState,
  type InputCommand,
  type SimContext,
  type Surface,
  type SurfaceParams,
  type Track,
  type TrackDefinition,
} from '@altf1/shared';
import { KeyboardController } from '../controller/KeyboardController';
import { CAMERA_PARAMS } from '../view/cameras/params';
import { DebugOverlay } from '../view/hud/DebugOverlay';
import { Hud } from '../view/hud/Hud';
import { LIVERIES } from '../view/pixelTexture';
import { SceneView } from '../view/SceneView';
import { GameLoop } from './GameLoop';

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

/** Wires Model, View and Controller together and drives them with the game loop. */
export class Game {
  private readonly track: Track;
  private state: GameState;
  /** State before the last tick, kept so the View can interpolate between the two. */
  private prevState: GameState;
  private lastInput: InputCommand = NEUTRAL_INPUT;
  /** Null = bot switched off. */
  private botLevel: BotLevel | null = START_BOT_LEVEL;
  private botMemory = NEW_BOT_MEMORY;
  /** The bot's plan and the params it was built from; rebuilt when the level or any tuning changes. */
  private botPlan: { readonly key: string; readonly plan: BotPlan } | null = null;
  /** Live tuning values fed to the simulation; the dev tuning panel edits these copies. */
  private readonly carParams: CarParams = { ...CAR_PARAMS };
  private readonly surfaceParams = copySurfaceParams();
  private readonly collisionParams = { ...COLLISION_PARAMS };
  private readonly cameraParams = { ...CAMERA_PARAMS };
  private readonly botParams = copyBotParams();
  /** Cars that drive a different car than the player's: the bot's, with its level's performance. */
  private readonly carParamsById: Record<CarId, CarParams> = {};
  private readonly ctx: SimContext;

  private readonly controller = new KeyboardController();
  private readonly view: SceneView;
  private readonly hud = new Hud();
  private readonly debugOverlay = new DebugOverlay();
  private readonly loop = new GameLoop({
    tick: () => this.tick(),
    render: (alpha, frameSeconds) => this.render(alpha, frameSeconds),
  });

  constructor(definition: TrackDefinition) {
    this.track = buildTrack(definition);
    this.state = createGame(
      this.track,
      import.meta.env.DEV ? [PLAYER_ID, BOT_ID, DUMMY_ID] : [PLAYER_ID, BOT_ID],
    );
    this.prevState = this.state;
    this.ctx = {
      track: this.track,
      carParams: this.carParams,
      carParamsById: this.carParamsById,
      surfaceParams: this.surfaceParams,
      collisionParams: this.collisionParams,
    };
    this.view = new SceneView(
      this.track,
      PLAYER_ID,
      { [PLAYER_ID]: LIVERIES.red, [BOT_ID]: LIVERIES.blue },
      this.cameraParams,
    );
    this.controller.onAction('toggleDebug', () => this.debugOverlay.toggle());
    this.controller.onAction('toggleCamera', () => this.view.toggleCamera());
    this.controller.onAction('cycleBot', () => this.cycleBot());
    // A fresh page load is the simplest full teardown (renderer, listeners, state): nothing to lose yet.
    this.controller.onAction('backToMenu', () => location.reload());
    this.hud.setBotLevel(this.botLevel);
    // Dev tools (and lil-gui) are dynamically imported inside this block so that
    // production builds, where the condition is a constant `false`, drop them entirely.
    if (import.meta.env.DEV) {
      void import('../dev/TuningPanel').then(({ TuningPanel }) => {
        const panel = new TuningPanel(
          this.carParams,
          this.surfaceParams,
          this.collisionParams,
          this.cameraParams,
          this.botParams,
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
      const result = botInput(bot, this.currentBotPlan(this.botLevel), this.track, this.botMemory);
      this.botMemory = result.memory;
      inputs[BOT_ID] = result.input;
    }
    this.prevState = this.state;
    this.state = stepGame(this.state, inputs, this.ctx);
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

  /** Applies a change of cars to both states, so the View never interpolates a car across the map. */
  private changeCars(change: (state: GameState) => GameState): void {
    this.state = change(this.state);
    this.prevState = change(this.prevState);
  }

  private currentBotPlan(level: BotLevel): BotPlan {
    const key = JSON.stringify([level, this.botParams[level], this.carParams]);
    if (this.botPlan?.key !== key) {
      const params = this.botParams[level];
      this.botPlan = { key, plan: buildBotPlan(this.track, this.carParams, params) };
      this.carParamsById[BOT_ID] = botCarParams(this.carParams, params);
    }
    return this.botPlan.plan;
  }

  private render(alpha: number, frameSeconds: number): void {
    this.view.render(this.prevState, this.state, alpha, frameSeconds);
    this.hud.update(this.state, PLAYER_ID, performance.now());
    const player = findCar(this.state, PLAYER_ID);
    if (player) this.debugOverlay.update(this.state, player, this.lastInput);
  }
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
