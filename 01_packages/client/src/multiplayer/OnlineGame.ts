import {
  buildTrack,
  findCar,
  NEUTRAL_INPUT,
  onlineSimContext,
  TICK_RATE,
  TRACKS,
  type InputCommand,
  type OnlineMode,
  type PlayerInfo,
  type ServerMessage,
  type TrackDefinition,
} from '@altf1/shared';
import { KeyboardController } from '../controller/KeyboardController';
import { GameLoop } from '../core/GameLoop';
import { CAMERA_PARAMS } from '../view/cameras/params';
import { DebugOverlay } from '../view/hud/DebugOverlay';
import { Hud } from '../view/hud/Hud';
import { Minimap } from '../view/hud/Minimap';
import { playerLivery } from '../view/pixelTexture';
import { SceneView } from '../view/SceneView';
import { Ghost } from './ghost';
import type { NetClient } from './NetClient';
import { Predictor } from './Predictor';

export type Entered = Extract<ServerMessage, { type: 'entered' }>;

/** A `ping` goes out every this many ticks (once a second). */
const PING_EVERY_TICKS = TICK_RATE;

/** A track by the name the server uses; null if this game doesn't know it. */
export function trackByName(name: string): TrackDefinition | null {
  return TRACKS.find((track) => track.name === name) ?? null;
}

/**
 * The online race: sends this player's input every tick and draws the room as predicted from the
 * server's snapshots, so the own car responds at once. See 01_docs/multiplayer.md#online-race.
 */
export class OnlineGame {
  private readonly playerId: string;
  private readonly controller = new KeyboardController();
  private readonly predictor: Predictor;
  private readonly view: SceneView;
  private readonly hud = new Hud();
  private readonly minimap: Minimap;
  private readonly debugOverlay = new DebugOverlay();
  /** Time trial only: the own best lap, raced as a see-through car. */
  private readonly ghost: Ghost | null;
  private lastInput: InputCommand = NEUTRAL_INPUT;
  /** `seq` of the next input sent; one per tick. */
  private nextSeq = 0;
  /** Last measured round trip (ms); null before the first pong. */
  private rttMs: number | null = null;
  private readonly loop = new GameLoop({
    tick: () => this.tick(),
    render: (alpha, frameSeconds) => this.render(alpha, frameSeconds),
  });

  /** `entered`: the server's answer to entering the room of `mode` on `track`. */
  constructor(
    private readonly client: NetClient,
    playerId: string,
    entered: Entered,
    mode: OnlineMode,
    track: TrackDefinition,
  ) {
    this.playerId = playerId;
    this.ghost = mode === 'timeTrial' ? new Ghost(playerId) : null;
    const built = buildTrack(track);
    this.predictor = new Predictor(playerId, onlineSimContext(built));
    this.view = new SceneView(built, this.playerId, {}, { ...CAMERA_PARAMS });
    this.minimap = new Minimap(built);
    this.setPlayers(entered.players);
    this.hud.hideBot();
    this.controller.onAction('toggleDebug', () => this.debugOverlay.toggle());
    this.controller.onAction('toggleCamera', () => this.view.toggleCamera());
    // A reload closes the socket (the server frees the nickname) and brings the start screen back.
    this.controller.onAction('backToMenu', () => location.reload());
    client.onMessage((message) => {
      if (message.type === 'snapshot') this.predictor.reconcile(message);
      else if (message.type === 'players') this.setPlayers(message.players);
      else if (message.type === 'pong') this.rttMs = performance.now() - message.t;
    });
  }

  start(): void {
    this.loop.start();
  }

  /**
   * One fixed tick: this player's numbered input goes to the server (R rides along as `reset`) and
   * moves the predicted world.
   */
  private tick(): void {
    this.lastInput = this.controller.sample();
    if (this.nextSeq % PING_EVERY_TICKS === 0) {
      this.client.send({ type: 'ping', t: performance.now() });
    }
    this.client.send({ type: 'input', seq: this.nextSeq, input: this.lastInput });
    this.predictor.step(this.nextSeq++, this.lastInput);
    if (this.ghost && this.predictor.current) this.ghost.record(this.predictor.current);
  }

  private render(alpha: number, frameSeconds: number): void {
    this.predictor.decay(frameSeconds);
    const curr = this.predictor.current;
    const prev = this.predictor.before;
    if (!curr || !prev) return; // nothing to draw before the first snapshot with this car
    this.view.setLookBack(this.controller.isHeld('lookBack'));
    // The ghost runs on the lap's clock, at the same in-between tick as the cars.
    this.view.setGhost(this.ghost?.frameAt(prev.tick + (curr.tick - prev.tick) * alpha) ?? null);
    this.view.render(prev, curr, alpha, frameSeconds);
    this.hud.update(curr, this.playerId, performance.now());
    this.minimap.update(curr.cars, this.playerId);
    const car = findCar(curr, this.playerId);
    if (car) this.debugOverlay.update(curr, car, this.lastInput, this.networkLines());
  }

  /** Network numbers for F3: round trip, how far ahead the prediction runs, last correction. */
  private networkLines(): string[] {
    const rtt = this.rttMs === null ? '-' : `${this.rttMs.toFixed(0)} ms`;
    return [
      `rtt       ${rtt}`,
      `ahead     ${this.predictor.ahead} ticks (inputs the server hasn't run)`,
      `corrected ${this.predictor.lastCorrection.toFixed(2)} m (last snapshot)`,
    ];
  }

  /** Colours, nickname tags and minimap legend for everyone online (sent on every join and leave). */
  private setPlayers(players: readonly PlayerInfo[]): void {
    for (const p of players) this.view.setLivery(p.id, playerLivery(p.livery));
    this.view.setNameTags(Object.fromEntries(players.map((p) => [p.id, p.nickname])));
    this.minimap.setPlayers(
      Object.fromEntries(
        players.map((p) => [p.id, { name: p.nickname, color: playerLivery(p.livery).body }]),
      ),
    );
  }
}
