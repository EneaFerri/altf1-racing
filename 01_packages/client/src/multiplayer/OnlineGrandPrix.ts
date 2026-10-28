import {
  GRAND_PRIX,
  lightsOn,
  type CarId,
  type GameState,
  type GrandPrixCommand,
  type GrandPrixInfo,
  type PlayerInfo,
} from '@altf1/shared';
import type { KeyboardController } from '../controller/KeyboardController';
import { GrandPrixPanel } from '../view/hud/GrandPrixPanel';
import type { Hud } from '../view/hud/Hud';
import { StartLights } from '../view/hud/StartLights';
import { grandPrixContent, lapName } from './grandPrixText';
import type { NetClient } from './NetClient';
import type { Predictor } from './Predictor';

/**
 * This player's side of a Grand Prix: the panel and the start lights, the manager's keys (Enter:
 * start / end qualifying / end the race; 1–3: race laps), the start hold handed to the prediction, and which car
 * to watch while the own one is off the track. See 01_docs/multiplayer.md#grand-prix.
 */
export class OnlineGrandPrix {
  private readonly panel = new GrandPrixPanel();
  private readonly lights = new StartLights();
  /** The Grand Prix as last told by the server; null until then. */
  private info: GrandPrixInfo | null = null;
  private players: readonly PlayerInfo[] = [];

  constructor(
    private readonly client: NetClient,
    private readonly playerId: CarId,
    private readonly predictor: Predictor,
    private readonly hud: Hud,
    controller: KeyboardController,
  ) {
    // The server ignores a command from anyone but the manager, or in the wrong phase.
    controller.onAction('confirm', () => {
      if (this.info?.phase === 'lobby') this.command({ action: 'start' });
      else if (this.info?.phase === 'qualifying') this.command({ action: 'endQualifying' });
      else if (this.info?.phase === 'race') this.command({ action: 'endRace' });
    });
    (['choice1', 'choice2', 'choice3'] as const).forEach((key, i) =>
      controller.onAction(key, () => {
        if (this.info?.phase === 'grid') {
          this.command({ action: 'startRace', laps: GRAND_PRIX.raceLaps[i]! });
        }
      }),
    );
  }

  /** The server's news about the Grand Prix. */
  update(info: GrandPrixInfo): void {
    this.info = info;
    this.predictor.hold = info.hold;
    this.hud.setLapName(lapName(info, this.playerId));
    this.show();
  }

  /** Everyone in the room (names and colours for the panel). */
  setPlayers(players: readonly PlayerInfo[]): void {
    this.players = players;
    this.show();
  }

  /** The start lights at (predicted) tick `tick`; once per frame. */
  render(tick: number): void {
    this.lights.update(lightsOn(tick, this.info?.hold ?? null));
  }

  /**
   * The car to watch in `state` while the own one is off the track: the best placed still on it
   * (race order in the race, else qualifying order).
   */
  spectate(state: GameState): CarId | null {
    const onTrack = (id: CarId): boolean => state.cars.some((car) => car.id === id);
    const order = this.info?.race.length ? this.info.race : (this.info?.qualifying ?? []);
    return order.map((entry) => entry.id).find(onTrack) ?? state.cars[0]?.id ?? null;
  }

  private command(command: GrandPrixCommand): void {
    if (this.info?.manager === this.playerId) this.client.send({ type: 'gp', ...command });
  }

  private show(): void {
    if (this.info) this.panel.show(grandPrixContent(this.info, this.players, this.playerId));
  }
}
