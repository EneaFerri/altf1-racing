import {
  CAR_PARAMS,
  createGame,
  NEUTRAL_INPUT,
  stepGame,
  type CarParams,
  type GameState,
  type InputCommand,
} from '@altf1/shared';
import { KeyboardController } from '../controller/KeyboardController';
import { DebugOverlay } from '../view/hud/DebugOverlay';
import { SceneView } from '../view/SceneView';
import { GameLoop } from './GameLoop';

/** Wires Model, View and Controller together and drives them with the game loop. */
export class Game {
  private state: GameState = createGame();
  /** State before the last tick, kept so the View can interpolate between the two. */
  private prevState: GameState = this.state;
  private lastInput: InputCommand = NEUTRAL_INPUT;
  /** Live handling values fed to the simulation; the dev tuning panel edits this copy. */
  private readonly params: CarParams = { ...CAR_PARAMS };

  private readonly controller = new KeyboardController();
  private readonly view = new SceneView();
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
        const panel = new TuningPanel(this.params);
        this.controller.onAction('toggleTuning', () => panel.toggle());
      });
    }
  }

  start(): void {
    this.loop.start();
  }

  private tick(): void {
    this.lastInput = this.controller.sample();
    this.prevState = this.state;
    this.state = stepGame(this.state, this.lastInput, this.params);
  }

  private render(alpha: number, frameSeconds: number): void {
    this.view.render(this.prevState, this.state, alpha, frameSeconds);
    this.debugOverlay.update(this.state, this.lastInput);
  }
}
