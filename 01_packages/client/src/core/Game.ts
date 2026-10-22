import {
  buildTrack,
  CAR_PARAMS,
  COLLISION_PARAMS,
  createGame,
  findCar,
  NEUTRAL_INPUT,
  placeCarAhead,
  stepGame,
  SURFACE_PARAMS,
  TEST_TRACK,
  type CarParams,
  type GameState,
  type InputCommand,
  type SimContext,
  type Surface,
  type SurfaceParams,
} from '@altf1/shared';
import { KeyboardController } from '../controller/KeyboardController';
import { DebugOverlay } from '../view/hud/DebugOverlay';
import { SceneView } from '../view/SceneView';
import { GameLoop } from './GameLoop';

/** Id of the car driven by this machine's keyboard. */
export const PLAYER_ID = 'player';
/** Dev-only parked car to crash into (F4 brings it in front of the player). */
const DUMMY_ID = 'dummy';
/** How far ahead of the player F4 parks the dummy (m). */
const DUMMY_DISTANCE = 25;

/** Wires Model, View and Controller together and drives them with the game loop. */
export class Game {
  private readonly track = buildTrack(TEST_TRACK);
  private state: GameState = createGame(
    this.track,
    import.meta.env.DEV ? [PLAYER_ID, DUMMY_ID] : [PLAYER_ID],
  );
  /** State before the last tick, kept so the View can interpolate between the two. */
  private prevState: GameState = this.state;
  private lastInput: InputCommand = NEUTRAL_INPUT;
  /** Live tuning values fed to the simulation; the dev tuning panel edits these copies. */
  private readonly carParams: CarParams = { ...CAR_PARAMS };
  private readonly surfaceParams = copySurfaceParams();
  private readonly collisionParams = { ...COLLISION_PARAMS };
  private readonly ctx: SimContext = {
    track: this.track,
    carParams: this.carParams,
    surfaceParams: this.surfaceParams,
    collisionParams: this.collisionParams,
  };

  private readonly controller = new KeyboardController();
  private readonly view = new SceneView(this.track, PLAYER_ID);
  private readonly debugOverlay = new DebugOverlay();
  private readonly loop = new GameLoop({
    tick: () => this.tick(),
    render: (alpha, frameSeconds) => this.render(alpha, frameSeconds),
  });

  constructor() {
    this.controller.onAction('toggleDebug', () => this.debugOverlay.toggle());
    // Dev tools (and lil-gui) are dynamically imported inside this block so that
    // production builds, where the condition is a constant `false`, drop them entirely.
    if (import.meta.env.DEV) {
      void import('../dev/TuningPanel').then(({ TuningPanel }) => {
        const panel = new TuningPanel(this.carParams, this.surfaceParams, this.collisionParams);
        this.controller.onAction('toggleTuning', () => panel.toggle());
      });
      this.controller.onAction('placeDummy', () => {
        const place = (state: GameState): GameState =>
          placeCarAhead(state, this.track, DUMMY_ID, PLAYER_ID, DUMMY_DISTANCE);
        // Both states, so the View doesn't interpolate the dummy across the map.
        this.state = place(this.state);
        this.prevState = place(this.prevState);
      });
    }
  }

  start(): void {
    this.loop.start();
  }

  private tick(): void {
    this.lastInput = this.controller.sample();
    this.prevState = this.state;
    this.state = stepGame(this.state, { [PLAYER_ID]: this.lastInput }, this.ctx);
  }

  private render(alpha: number, frameSeconds: number): void {
    this.view.render(this.prevState, this.state, alpha, frameSeconds);
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
