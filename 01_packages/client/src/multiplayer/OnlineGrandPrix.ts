import {
  SafetyCarDelta,
  safetyCarPlans,
  safetyCarWet,
  TYRE_COMPOUNDS,
  WEATHERS,
  wetnessAt,
  damageInPhase,
  offersRain,
  pitStatus,
  type Track,
  GRAND_PRIX,
  lightsOn,
  type CarId,
  type GameState,
  type GrandPrixCommand,
  type GrandPrixInfo,
  type PlayerInfo,
} from '@altf1/shared';
import type { KeyboardController } from '../controller/KeyboardController';
import { GrandPrixPanel, type PitBadge } from '../view/hud/GrandPrixPanel';
import { playerLivery } from '../view/pixelTexture';
import type { Hud } from '../view/hud/Hud';
import { ResultsScreen } from '../view/hud/ResultsScreen';
import { StartLights } from '../view/hud/StartLights';
import type { SceneView } from '../view/SceneView';
import { CustomLaps } from '../race/customLaps';
import { GREEN_FLAG_NOTICE, penaltyNotice, raceControl, wentGreen } from '../race/raceControlText';
import { RaceControlBoard } from '../view/hud/RaceControlBoard';
import { chequeredFlag, grandPrixContent, lapName, type DriverLook } from '../race/grandPrixText';
import type { NetClient } from './NetClient';
import type { Predictor } from './Predictor';
import {
  classificationRows,
  playAgainItem,
  podiumContent,
  type RaceResult,
} from '../race/resultsText';

/**
 * This player's side of a Grand Prix: the panel and the start lights, the manager's keys (Enter:
 * start / end qualifying / end the race; on the grid 1–3: race over 4 / 8 / 12 laps, 4: any other
 * distance, ←/→ to set it, Enter to start; in the lobby of a track with rain, 1/2: dry / rain), the weather handed to the prediction and the view, the start hold handed to the prediction,
 * which car to watch while the own one is off the track, and the results screen (podium, then
 * classification with Play again / Exit). See 01_docs/multiplayer.md#grand-prix.
 */
export class OnlineGrandPrix {
  private readonly panel = new GrandPrixPanel();
  private readonly lights = new StartLights();
  private readonly results = new ResultsScreen();
  /** The podium or the classification card is up: the GP keys do nothing meanwhile. */
  private onResults = false;
  /** The Grand Prix as last told by the server; null until then. */
  private info: GrandPrixInfo | null = null;
  /** Everyone in the room, as the panel and the results show them. */
  private drivers: readonly DriverLook[] = [];
  /** The manager's own race distance on the grid (key 4, then ←/→); null = not chosen. */
  private readonly customLaps = new CustomLaps();
  /** The safety car's board, and this player's delta counted on the predicted world. */
  private readonly raceControlBoard = new RaceControlBoard();
  private readonly delta = new SafetyCarDelta();
  private deltaTick: number | null = null;
  /** The race's penalties already told to this player. */
  private incidentsTold = 0;

  constructor(
    private readonly client: NetClient,
    private readonly playerId: CarId,
    private readonly predictor: Predictor,
    private readonly hud: Hud,
    controller: KeyboardController,
    /** The view: the own pit box marked, the flag marshal at the line, the weather. */
    private readonly scene: Pick<
      SceneView,
      'markPitBox' | 'showFlagMarshal' | 'setWetness' | 'setSafetyCar' | 'setYellowFlags'
    >,
    /** The room's track, with its pit lane: who is in it is shown in the panel. */
    private readonly track: Track,
  ) {
    // The server ignores a command from anyone but the manager, or in the wrong phase.
    controller.onAction('confirm', () => {
      if (this.onResults) return;
      if (this.info?.phase === 'lobby') this.command({ action: 'start' });
      else if (this.info?.phase === 'qualifying') this.command({ action: 'endQualifying' });
      else if (this.info?.phase === 'grid' && this.customLaps.value !== null) {
        this.command({ action: 'startRace', laps: this.customLaps.value });
      } else if (this.info?.phase === 'race') this.command({ action: 'endRace' });
    });
    (['choice1', 'choice2', 'choice3'] as const).forEach((key, i) =>
      controller.onAction(key, () => {
        if (this.onResults) return;
        if (this.info?.phase === 'grid') {
          this.command({ action: 'startRace', laps: GRAND_PRIX.raceLaps[i]! });
        } else if (this.info?.phase === 'lobby' && this.canRain) {
          this.command({ action: 'weather', weather: WEATHERS[i]! });
        } else if (this.info?.phase === 'qualifying' || this.info?.phase === 'race') {
          // On track, stopped in the box: 1 softs, 2 mediums, 3 intermediates (ignored elsewhere).
          controller.chooseCompound(TYRE_COMPOUNDS[i]!);
        }
      }),
    );
    controller.onAction('choice4', () => {
      if (this.onResults) return;
      // On track, stopped in the box: 4 full wets.
      if (this.info?.phase === 'qualifying' || this.info?.phase === 'race') {
        controller.chooseCompound('wet');
      }
      if (!this.choosingLaps) return;
      this.customLaps.open();
      this.show();
    });
    (['lapsDown', 'lapsUp'] as const).forEach((key, i) =>
      controller.onAction(key, () => {
        if (this.onResults || !this.choosingLaps) return;
        this.customLaps.step(i === 0 ? -1 : 1);
        this.show();
      }),
    );
  }

  /** Whether this player is the manager with the cars on the grid: the race distance is theirs. */
  private get choosingLaps(): boolean {
    return this.info?.phase === 'grid' && this.info.manager === this.playerId;
  }

  /** Whether this circuit's GP may be run in the rain (the manager's 1/2 in the lobby). */
  private get canRain(): boolean {
    return offersRain(this.track.name);
  }

  /** The server's news about the Grand Prix. */
  update(info: GrandPrixInfo): void {
    const raceOver =
      info.phase === 'results' &&
      this.info?.phase !== 'results' &&
      info.drivers.includes(this.playerId);
    if (wentGreen(this.info, info)) {
      this.raceControlBoard.tell(GREEN_FLAG_NOTICE, performance.now(), true);
    }
    this.info = info;
    if (!this.choosingLaps) this.customLaps.reset(); // a new grid starts from the presets
    this.predictor.hold = info.hold;
    this.predictor.setDamage(damageInPhase(info.phase));
    this.predictor.setPitBoxes(info.boxes);
    this.predictor.setWeather(info.forecast);
    this.predictor.safetyCar = info.safetyCar ?? null;
    this.scene.setSafetyCar(info.safetyCar ?? null);
    this.scene.setYellowFlags(info.yellowFlags ?? []);
    this.tellPenalties(info);
    this.hud.setSessionBests(info.sectorBests);
    this.scene.markPitBox(info.boxes[this.playerId] ?? null);
    this.scene.showFlagMarshal(chequeredFlag(info));
    this.hud.setLapName(lapName(info, this.playerId));
    if (raceOver) void this.showResults(info);
    else if (this.onResults) this.results.setPlayAgain(playAgainItem(info));
    this.show();
  }

  /** Everyone in the room (names and colours for the panel). */
  setPlayers(players: readonly PlayerInfo[]): void {
    this.drivers = players.map((p) => ({
      id: p.id,
      name: p.nickname,
      livery: playerLivery(p.livery),
    }));
    this.show();
  }

  /** The race's new penalties: this player's own told on the safety car board. */
  private tellPenalties(info: GrandPrixInfo): void {
    const incidents = info.incidents ?? [];
    if (incidents.length < this.incidentsTold) this.incidentsTold = 0; // a new race
    for (const incident of incidents.slice(this.incidentsTold)) {
      if (incident.id === this.playerId) {
        this.raceControlBoard.tell(penaltyNotice(incident), performance.now());
      }
    }
    this.incidentsTold = incidents.length;
  }

  /**
   * The safety car board, with this player's delta counted tick by tick on the predicted world
   * (as the server counts it).
   */
  private showSafetyCar(state: GameState): void {
    const info = this.info;
    if (!info) return;
    const sc = info.phase === 'race' ? (info.safetyCar ?? null) : null;
    const ticks = this.deltaTick === null ? 1 : state.tick - this.deltaTick;
    if (ticks > 0) {
      const wet = safetyCarWet(wetnessAt(info.forecast, state.tick));
      if (sc) this.delta.update(state, sc, this.track, safetyCarPlans(this.track, wet), ticks);
      else this.delta.clear();
      this.deltaTick = state.tick;
    }
    const nameOf = (id: CarId): string => this.drivers.find((d) => d.id === id)?.name ?? id;
    const content = raceControl(
      info,
      this.playerId,
      this.delta.get(this.playerId),
      state.tick,
      nameOf,
      this.delta.graceLeft(this.playerId, state.tick),
    );
    this.raceControlBoard.setVisible(!this.onResults);
    this.raceControlBoard.update(content, performance.now());
  }

  /** The start lights and who is in the pit lane, in the (predicted) world `state`; once per frame. */
  render(state: GameState): void {
    this.lights.update(lightsOn(state.tick, this.info?.hold ?? null));
    // The track as wet as the forecast says now (a variable GP's weather turns live).
    this.scene.setWetness(this.info ? wetnessAt(this.info.forecast, state.tick) : 0);
    this.showSafetyCar(state);
    const pits = new Map<CarId, PitBadge>();
    for (const car of state.cars) {
      const status = pitStatus(this.track, car, state.tick);
      if (status) pits.set(car.id, status.stopLeft !== null ? 'BOX' : 'PIT');
    }
    const key = [...pits].join();
    if (key === this.pitsKey) return;
    this.pits = pits;
    this.pitsKey = key;
    this.show();
  }

  /** Who is in the pit lane, as last shown (and a key to tell when it changes). */
  private pits: ReadonlyMap<CarId, PitBadge> = new Map();
  private pitsKey = '';

  /**
   * The car to watch in `state` while the own one is off the track: the best placed still on it
   * (race order in the race, else qualifying order).
   */
  spectate(state: GameState): CarId | null {
    const onTrack = (id: CarId): boolean => state.cars.some((car) => car.id === id);
    const order = this.info?.race.length ? this.info.race : (this.info?.qualifying ?? []);
    return order.map((entry) => entry.id).find(onTrack) ?? state.cars[0]?.id ?? null;
  }

  /**
   * The podium, then the classification of the race just over (frozen as it was); Play again
   * asks the server for the new lobby, Exit goes back to the start screen.
   */
  private async showResults(info: GrandPrixInfo): Promise<void> {
    this.onResults = true;
    this.panel.setVisible(false);
    const result: RaceResult = { race: info.race, raceLaps: info.raceLaps!, drivers: this.drivers };
    await this.results.podium(podiumContent(result));
    const choice = await this.results.classification(
      `GRAND PRIX · CLASSIFICATION · ${result.raceLaps} LAPS`,
      classificationRows(result, this.playerId),
      playAgainItem(this.info!),
    );
    if (choice === 'exit') return location.reload();
    this.client.send({ type: 'gp', action: 'playAgain' });
    this.onResults = false;
    this.panel.setVisible(true);
  }

  private command(command: GrandPrixCommand): void {
    if (this.info?.manager === this.playerId) this.client.send({ type: 'gp', ...command });
  }

  private show(): void {
    if (this.info) {
      this.panel.show(
        grandPrixContent(
          this.info,
          this.drivers,
          this.playerId,
          this.pits,
          this.canRain,
          this.customLaps.value,
        ),
      );
    }
  }
}
