import {
  buildTrack,
  findCar,
  NEUTRAL_INPUT,
  TRACKS,
  type InputCommand,
  type PlayerInfo,
  type ServerMessage,
  type TrackDefinition,
} from '@altf1/shared';
import { KeyboardController } from '../controller/KeyboardController';
import { GameLoop } from '../core/GameLoop';
import { CAMERA_PARAMS } from '../view/cameras/params';
import { DebugOverlay } from '../view/hud/DebugOverlay';
import { Hud } from '../view/hud/Hud';
import { playerLivery } from '../view/pixelTexture';
import { SceneView } from '../view/SceneView';
import type { NetClient } from './NetClient';
import { SnapshotBuffer } from './SnapshotBuffer';

export type Entered = Extract<ServerMessage, { type: 'entered' }>;

/** A track by the name the server uses; null if this game doesn't know it. */
export function trackByName(name: string): TrackDefinition | null {
  return TRACKS.find((track) => track.name === name) ?? null;
}

/**
 * The online race: sends this player's input every tick and draws the server's snapshots.
 * No local simulation yet (prediction is step 2.2). See 01_docs/multiplayer.md#online-race.
 */
export class OnlineGame {
  private readonly playerId: string;
  private readonly controller = new KeyboardController();
  private readonly buffer = new SnapshotBuffer();
  private readonly view: SceneView;
  private readonly hud = new Hud();
  private readonly debugOverlay = new DebugOverlay();
  private lastInput: InputCommand = NEUTRAL_INPUT;
  private readonly loop = new GameLoop({
    tick: () => this.tick(),
    render: (_alpha, frameSeconds) => this.render(frameSeconds),
  });

  /** `entered`: the server's answer to entering the room of `track`. */
  constructor(
    private readonly client: NetClient,
    playerId: string,
    entered: Entered,
    track: TrackDefinition,
  ) {
    this.playerId = playerId;
    this.view = new SceneView(buildTrack(track), this.playerId, {}, { ...CAMERA_PARAMS });
    this.setPlayers(entered.players);
    this.hud.hideBot();
    this.controller.onAction('toggleDebug', () => this.debugOverlay.toggle());
    this.controller.onAction('toggleCamera', () => this.view.toggleCamera());
    // A reload closes the socket (the server frees the nickname) and brings the start screen back.
    this.controller.onAction('backToMenu', () => location.reload());
    client.onMessage((message) => {
      if (message.type === 'snapshot') this.buffer.push(message.state);
      else if (message.type === 'players') this.setPlayers(message.players);
    });
  }

  start(): void {
    this.loop.start();
  }

  /** One fixed tick: this player's input goes to the server (R rides along as `reset`). */
  private tick(): void {
    this.lastInput = this.controller.sample();
    this.client.send({ type: 'input', input: this.lastInput });
  }

  private render(frameSeconds: number): void {
    this.buffer.advance(frameSeconds);
    const sample = this.buffer.sample();
    if (!sample) return; // nothing to draw before the first snapshot
    this.view.setLookBack(this.controller.isHeld('lookBack'));
    this.view.render(sample.prev, sample.curr, sample.alpha, frameSeconds);
    this.hud.update(sample.curr, this.playerId, performance.now());
    const car = findCar(sample.curr, this.playerId);
    if (car) this.debugOverlay.update(sample.curr, car, this.lastInput);
  }

  /** Colours and nickname tags for everyone online (sent on every join and leave). */
  private setPlayers(players: readonly PlayerInfo[]): void {
    for (const p of players) this.view.setLivery(p.id, playerLivery(p.livery));
    this.view.setNameTags(Object.fromEntries(players.map((p) => [p.id, p.nickname])));
  }
}
