import {
  createGame,
  NEUTRAL_INPUT,
  stepGame,
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
  private lastInput: InputCommand = NEUTRAL_INPUT;

  private readonly controller = new KeyboardController();
  private readonly view = new SceneView();
  private readonly debugOverlay = new DebugOverlay();
  private readonly loop = new GameLoop({
    tick: () => this.tick(),
    render: () => this.render(),
  });

  constructor() {
    this.controller.onAction('toggleDebug', () => this.debugOverlay.toggle());
  }

  start(): void {
    this.loop.start();
  }

  private tick(): void {
    this.lastInput = this.controller.sample();
    this.state = stepGame(this.state, this.lastInput);
  }

  private render(): void {
    this.view.render();
    this.debugOverlay.update(this.state, this.lastInput);
  }
}
