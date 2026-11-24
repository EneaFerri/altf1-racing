import {
  BOT_PARAMS,
  botCarParams,
  botLapTicks,
  BotSquad,
  CAR_PARAMS,
  constructorStandings,
  findCar,
  GRAND_PRIX,
  GrandPrix,
  lightsOn,
  OfflineRoom,
  PLAYER_SEAT_ID,
  racePoints,
  pitStatus,
  squadBots,
  TEAMS,
  teamBoxes,
  teamLineup,
  type BotLevel,
  type CarId,
  type CarParams,
  type GameState,
  type GrandPrixCommand,
  type GrandPrixInfo,
  type GrandPrixPhase,
  type Seat,
  type TeamId,
  type TrackDefinition,
  type Weather,
} from '@altf1/shared';
import { KeyboardController } from '../controller/KeyboardController';
import { GameLoop } from '../core/GameLoop';
import { CustomLaps } from '../race/customLaps';
import { chequeredFlag, grandPrixContent, lapName, type DriverLook } from '../race/grandPrixText';
import {
  classificationRows,
  constructorRows,
  podiumContent,
  type RaceResult,
} from '../race/resultsText';
import { CAMERA_PARAMS } from '../view/cameras/params';
import { GrandPrixPanel, type PitBadge } from '../view/hud/GrandPrixPanel';
import { Hud } from '../view/hud/Hud';
import { Minimap } from '../view/hud/Minimap';
import { ResultsScreen } from '../view/hud/ResultsScreen';
import { StartLights } from '../view/hud/StartLights';
import { rememberedNickname } from '../view/menu/NicknameScreen';
import { TEAM_LIVERIES } from '../view/pixelTexture';
import { SceneView } from '../view/SceneView';
import type { TrackTheme } from '../view/themes/theme';

/** The bots' qualifying times spread up to this share above their class's lap (random per bot). */
const QUALIFYING_SPREAD = 0.01;

/**
 * Single player's Grand Prix (S.5): the player in the team they chose against 9 bots, on this
 * machine. The same Grand Prix rules as online (`GrandPrix` on an `OfflineRoom`): qualifying (the
 * player alone, 3 timed laps; the bots' times measured for their class), the grid with the race
 * distance (1/2/3, or 4 + ←/→ + Enter), the F1 start, the race with damage, mandatory stops and
 * the weather chosen in the menu, then the podium and the classification (Race again / Exit).
 * The player is the GP's only manager. See 01_docs/bot.md#single-player-grand-prix.
 */
export class SinglePlayerGrandPrix {
  private readonly seats: readonly Seat[];
  private readonly drivers: readonly DriverLook[];
  private readonly room: OfflineRoom;
  private readonly squad: BotSquad;
  /** Each class's flying lap here (ticks), measured once. */
  private readonly classLaps: ReadonlyMap<BotLevel, number>;
  private readonly weather: Weather;
  private grandPrix!: GrandPrix;
  private info!: GrandPrixInfo;
  /** The state before the last tick, for the view's interpolation. */
  private prevState: GameState;
  private readonly customLaps = new CustomLaps();
  /** The podium or the classification is up: the GP keys do nothing meanwhile. */
  private onResults = false;

  private readonly controller = new KeyboardController();
  private readonly view: SceneView;
  private readonly hud = new Hud();
  private readonly minimap: Minimap;
  private readonly panel = new GrandPrixPanel();
  private readonly lights = new StartLights();
  private readonly results = new ResultsScreen();
  /** Who is in the pit lane, as last shown (and a key to tell when it changes). */
  private pits: ReadonlyMap<CarId, PitBadge> = new Map();
  private pitsKey = '';
  private readonly loop = new GameLoop({
    tick: () => this.tick(),
    render: (alpha, frameSeconds) => this.render(alpha, frameSeconds),
  });

  constructor(definition: TrackDefinition, theme: TrackTheme, team: TeamId, weather: Weather) {
    this.weather = weather;
    this.seats = teamLineup(team, Math.random, rememberedNickname() || 'You');
    this.drivers = this.seats.map((seat) => ({
      id: seat.id,
      name: seat.name,
      livery: TEAM_LIVERIES[seat.team],
    }));
    const params: Record<CarId, CarParams> = {};
    for (const seat of this.seats) {
      if (seat.kind !== 'player') params[seat.id] = botCarParams(CAR_PARAMS, BOT_PARAMS[seat.kind]);
    }
    const boxes = teamBoxes(this.seats);
    this.room = new OfflineRoom(definition, params, boxes);
    this.room.setWeather(weather);
    this.classLaps = new Map(
      (['hard', 'medium'] as const).map((level) => [level, botLapTicks(this.room.sim, level)!]),
    );
    this.squad = new BotSquad(
      this.room.track,
      squadBots(this.seats),
      this.room.sim.weather?.params,
    );
    this.prevState = this.room.state;

    this.view = new SceneView(
      this.room.track,
      PLAYER_SEAT_ID,
      Object.fromEntries(this.drivers.map((d) => [d.id, d.livery])),
      { ...CAMERA_PARAMS },
      theme,
    );
    this.view.setWeather(weather);
    this.view.markPitBox(boxes[PLAYER_SEAT_ID]!);
    this.view.setNameTags(
      Object.fromEntries(
        this.drivers.filter((d) => d.id !== PLAYER_SEAT_ID).map((d) => [d.id, d.name]),
      ),
    );
    this.minimap = new Minimap(this.room.track);
    this.minimap.setPlayers(
      Object.fromEntries(this.drivers.map((d) => [d.id, { name: d.name, color: d.livery.body }])),
    );
    this.hud.hideBot();
    this.hud.usePitLane(this.room.track);
    this.bindKeys();
    this.newGrandPrix();
  }

  start(): void {
    this.loop.start();
  }

  /** A Grand Prix from the start: the bots' qualifying given, the player out on track to qualify. */
  private newGrandPrix(): void {
    this.room.hold = null;
    this.grandPrix = new GrandPrix(this.room);
    this.grandPrix.add(PLAYER_SEAT_ID, this.seats.find((s) => s.kind === 'player')!.name);
    for (const seat of this.seats) {
      if (seat.kind === 'player') continue;
      const lap = this.classLaps.get(seat.kind)!;
      this.grandPrix.addSimulated(
        seat.id,
        seat.name,
        Math.round(lap * (1 + Math.random() * QUALIFYING_SPREAD)),
      );
    }
    if (this.weather === 'rain') this.command({ action: 'weather', weather: 'rain' });
    this.squad.setRace(null);
    this.command({ action: 'start' });
    this.prevState = this.room.state;
  }

  private bindKeys(): void {
    const phase = (): GrandPrixPhase | null => (this.onResults ? null : this.info.phase);
    this.controller.onAction('confirm', () => {
      if (phase() === 'qualifying') this.command({ action: 'endQualifying' });
      else if (phase() === 'grid' && this.customLaps.value !== null) {
        this.command({ action: 'startRace', laps: this.customLaps.value });
      } else if (phase() === 'race') this.command({ action: 'endRace' });
    });
    (['choice1', 'choice2', 'choice3'] as const).forEach((key, i) =>
      this.controller.onAction(key, () => {
        if (phase() === 'grid')
          this.command({ action: 'startRace', laps: GRAND_PRIX.raceLaps[i]! });
        // On track, stopped in the box: 1 softs, 2 mediums (ignored anywhere else).
        else if ((phase() === 'qualifying' || phase() === 'race') && i < 2) {
          this.controller.chooseCompound(i === 0 ? 'soft' : 'medium');
        }
      }),
    );
    this.controller.onAction('choice4', () => {
      if (phase() !== 'grid') return;
      this.customLaps.open();
      this.show();
    });
    (['lapsDown', 'lapsUp'] as const).forEach((key, i) =>
      this.controller.onAction(key, () => {
        if (phase() !== 'grid') return;
        this.customLaps.step(i === 0 ? -1 : 1);
        this.show();
      }),
    );
    this.controller.onAction('toggleCamera', () => this.view.toggleCamera());
    this.controller.onAction('toggleRain', () => this.view.toggleRaindrops());
    // A fresh page load is the simplest full teardown (renderer, listeners, state).
    this.controller.onAction('backToMenu', () => location.reload());
  }

  /** The player's command to the Grand Prix (always the manager here), then the news of it. */
  private command(command: GrandPrixCommand): void {
    if (this.grandPrix.command(PLAYER_SEAT_ID, command)) this.update();
  }

  /** One fixed tick: the player's and the bots' inputs move the race, then the GP reads it. */
  private tick(): void {
    const inputs = this.squad.inputs(this.room.state, this.room.held);
    inputs[PLAYER_SEAT_ID] = this.controller.sample();
    this.prevState = this.room.state;
    this.room.step(inputs);
    if (this.grandPrix.afterTick()) this.update();
  }

  /** The Grand Prix changed: everything that shows it follows. */
  private update(): void {
    const before = this.info?.phase;
    this.info = this.grandPrix.info;
    const { phase } = this.info;
    if (phase === 'race' && before !== 'race') this.squad.setRace(this.info.raceLaps);
    if (phase !== 'grid') this.customLaps.reset();
    if (phase !== before) this.prevState = this.room.state; // cars moved to the grid: no blending
    this.hud.setSessionBests(this.info.sectorBests);
    this.hud.setLapName(lapName(this.info, PLAYER_SEAT_ID));
    this.view.showFlagMarshal(chequeredFlag(this.info));
    if (phase === 'results' && before !== 'results') void this.showResults();
    this.show();
  }

  private render(alpha: number, frameSeconds: number): void {
    const state = this.room.state;
    const own = findCar(state, PLAYER_SEAT_ID);
    // Off the track (qualifying or the race done): watch the best placed car still on it.
    this.view.follow(own ? PLAYER_SEAT_ID : (this.spectate(state) ?? PLAYER_SEAT_ID));
    this.hud.setVisible(own !== undefined);
    this.lights.update(lightsOn(state.tick, this.room.hold));
    this.showPits(state);
    this.view.setLookBack(this.controller.isHeld('lookBack'));
    this.view.render(this.prevState, state, alpha, frameSeconds);
    this.hud.update(state, PLAYER_SEAT_ID, performance.now());
    this.minimap.update(state.cars, PLAYER_SEAT_ID);
  }

  /** The best placed car on the track (race order in the race, else qualifying order). */
  private spectate(state: GameState): CarId | null {
    const onTrack = (id: CarId): boolean => state.cars.some((car) => car.id === id);
    const order = this.info.race.length ? this.info.race : this.info.qualifying;
    return order.map((entry) => entry.id).find(onTrack) ?? state.cars[0]?.id ?? null;
  }

  /** Who is in the pit lane (PIT, BOX while stopped) beside their name, when that changes. */
  private showPits(state: GameState): void {
    const pits = new Map<CarId, PitBadge>();
    for (const car of state.cars) {
      const status = pitStatus(this.room.track, car, state.tick);
      if (status) pits.set(car.id, status.stopLeft !== null ? 'BOX' : 'PIT');
    }
    const key = [...pits].join();
    if (key === this.pitsKey) return;
    this.pits = pits;
    this.pitsKey = key;
    this.show();
  }

  private show(): void {
    if (this.onResults) return;
    this.panel.show(
      grandPrixContent(
        this.info,
        this.drivers,
        PLAYER_SEAT_ID,
        this.pits,
        false,
        this.customLaps.value,
      ),
    );
  }

  /**
   * The podium, the drivers' classification with their points, then the constructors' standings
   * of this race; Race again starts a new GP, Exit goes to the start.
   */
  private async showResults(): Promise<void> {
    this.onResults = true;
    this.panel.setVisible(false);
    const result: RaceResult = {
      race: this.info.race,
      raceLaps: this.info.raceLaps!,
      drivers: this.drivers,
    };
    const points = racePoints(result.race);
    const teamName = new Map(TEAMS.map((team) => [team.id, team.name]));
    const teamOf = new Map(this.seats.map((seat) => [seat.id, teamName.get(seat.team)!]));
    await this.results.podium(podiumContent(result));
    const first = await this.results.classification(
      `GRAND PRIX · CLASSIFICATION · ${result.raceLaps} LAPS`,
      classificationRows(result, PLAYER_SEAT_ID, { points, teamOf: (id) => teamOf.get(id) ?? '' }),
      { name: 'Constructors', detail: "The teams' points", value: 'next' },
    );
    if (first === 'exit') return location.reload();
    const ownTeam = this.seats.find((seat) => seat.kind === 'player')!.team;
    const choice = await this.results.constructors(
      'GRAND PRIX · CONSTRUCTORS',
      constructorRows(constructorStandings(result.race, points, this.seats), ownTeam),
      { name: 'Race again', detail: 'Same team and circuit', value: 'playAgain' },
    );
    if (choice === 'exit') return location.reload();
    this.onResults = false;
    this.panel.setVisible(true);
    this.newGrandPrix();
  }
}
