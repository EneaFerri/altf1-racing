import type { CarParams } from '../config/car';
import { DRY_FORECAST, type Forecast } from '../config/weather';
import { onlineSimContext } from '../net/simContext';
import type { CarId } from '../sim/car';
import { createGame, removeCar, repairCars, spawnOnGrid, stepGame } from '../sim/game';
import type { GameState, InputMap, SimContext } from '../sim/game';
import { startingTyres } from '../sim/weather';
import { buildTrack } from '../track/buildTrack';
import type { Track, TrackDefinition } from '../track/types';
import type { GrandPrixRoom } from './GrandPrix';
import { heldInputs, type StartHold } from './hold';

/**
 * Single player's Grand Prix room (S.5): the race on this machine, like the server's `Room` but
 * without network: the track with its pit lane, the bots' cars (`carParamsById`) and fixed pit
 * boxes (`boxes`: by team, decided by single player, so the GP's own numbering is not used).
 * The same simulation parameters as online (`onlineSimContext`). Pure (no clock).
 */
export class OfflineRoom implements GrandPrixRoom {
  readonly definition: TrackDefinition;
  readonly track: Track;
  hold: StartHold | null = null;
  private current: GameState;
  private rules: { damage: boolean; forecast: Forecast } = {
    damage: false,
    forecast: DRY_FORECAST,
  };
  private ctx: SimContext;

  private readonly carParamsById: Readonly<Record<CarId, CarParams>>;
  private readonly boxes: Readonly<Record<CarId, number>>;

  constructor(
    definition: TrackDefinition,
    carParamsById: Readonly<Record<CarId, CarParams>>,
    boxes: Readonly<Record<CarId, number>>,
  ) {
    this.definition = definition;
    this.carParamsById = carParamsById;
    this.boxes = boxes;
    this.track = buildTrack(definition, { pitLane: true });
    this.current = createGame(this.track, []);
    this.ctx = this.context();
  }

  get state(): GameState {
    return this.current;
  }

  /** What the simulation runs with now (the weather's wet params for the bots' plans too). */
  get sim(): SimContext {
    return this.ctx;
  }

  /** How wet the track is when. */
  get forecast(): Forecast {
    return this.rules.forecast;
  }

  setDamage(on: boolean): void {
    if (on === this.rules.damage) return;
    this.rules = { ...this.rules, damage: on };
    this.ctx = this.context();
    if (!on) this.current = repairCars(this.current);
  }

  /** Single player's boxes are the teams' (`boxes`): the Grand Prix's numbering is ignored. */
  setPitBoxes(_boxes: Readonly<Record<CarId, number>>): void {}

  setWeather(forecast: Forecast): void {
    if (forecast === this.rules.forecast) return;
    this.rules = { ...this.rules, forecast };
    this.ctx = this.context();
  }

  /** On a wet track the cars start on the tyres it asks for (`startingTyres`). */
  restart(order: readonly CarId[]): void {
    const tyres = startingTyres(this.ctx.weather, this.ctx.tyres, this.current.tick);
    this.current = { ...createGame(this.track, order, tyres), tick: this.current.tick };
  }

  retire(id: CarId): void {
    this.current = removeCar(this.current, id);
  }

  spawn(id: CarId): void {
    this.current = spawnOnGrid(this.current, this.track, id);
  }

  /** One fixed tick with everyone's `inputs` (all neutral while the start `hold`s the cars). */
  step(inputs: InputMap): void {
    this.current = stepGame(
      this.current,
      heldInputs(inputs, this.current.tick, this.hold),
      this.ctx,
    );
  }

  /** Whether the start lights still hold the cars at the step from now. */
  get held(): boolean {
    return this.hold !== null && this.current.tick < this.hold.until;
  }

  private context(): SimContext {
    const online = onlineSimContext(this.track, { ...this.rules, pitBoxes: this.boxes });
    return { ...online, carParamsById: this.carParamsById };
  }
}
