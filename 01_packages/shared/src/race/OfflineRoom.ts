import type { CarParams } from '../config/car';
import type { Weather } from '../config/weather';
import { onlineSimContext } from '../net/simContext';
import type { CarId } from '../sim/car';
import { createGame, removeCar, repairCars, spawnOnGrid, stepGame } from '../sim/game';
import type { GameState, InputMap, SimContext } from '../sim/game';
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
  private rules: { damage: boolean; weather: Weather } = { damage: false, weather: 'dry' };
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

  get weather(): Weather {
    return this.rules.weather;
  }

  setDamage(on: boolean): void {
    if (on === this.rules.damage) return;
    this.rules = { ...this.rules, damage: on };
    this.ctx = this.context();
    if (!on) this.current = repairCars(this.current);
  }

  /** Single player's boxes are the teams' (`boxes`): the Grand Prix's numbering is ignored. */
  setPitBoxes(_boxes: Readonly<Record<CarId, number>>): void {}

  setWeather(weather: Weather): void {
    if (weather === this.rules.weather) return;
    this.rules = { ...this.rules, weather };
    this.ctx = this.context();
  }

  restart(order: readonly CarId[]): void {
    this.current = { ...createGame(this.track, order), tick: this.current.tick };
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
