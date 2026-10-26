import {
  buildTrack,
  CAR_PARAMS,
  COLLISION_PARAMS,
  removeCar,
  SLIPSTREAM_PARAMS,
  spawnOnGrid,
  stepGame,
  SURFACE_PARAMS,
  TEST_TRACK,
  type CarId,
  type GameState,
  type InputCommand,
  type SimContext,
  type Track,
  type TrackDefinition,
} from '@altf1/shared';

/**
 * One multiplayer race: the authoritative simulation of a track with every player's car, driven
 * by each player's latest input. Pure (no sockets, no timers). See 01_docs/multiplayer.md#room.
 */
export class Room {
  readonly definition: TrackDefinition;
  private readonly track: Track;
  private readonly ctx: SimContext;
  private current: GameState = { tick: 0, cars: [], impacts: [], laps: [] };
  /** Latest input per player; a car with no entry yet gets NEUTRAL_INPUT from stepGame. */
  private readonly inputs = new Map<CarId, InputCommand>();

  constructor(definition: TrackDefinition = TEST_TRACK) {
    this.definition = definition;
    this.track = buildTrack(definition);
    this.ctx = {
      track: this.track,
      carParams: CAR_PARAMS,
      surfaceParams: SURFACE_PARAMS,
      collisionParams: COLLISION_PARAMS,
      slipstreamParams: SLIPSTREAM_PARAMS,
    };
  }

  get state(): GameState {
    return this.current;
  }

  /** Puts the player's car on the first free grid slot. */
  add(id: CarId): void {
    this.current = spawnOnGrid(this.current, this.track, id);
  }

  remove(id: CarId): void {
    this.current = removeCar(this.current, id);
    this.inputs.delete(id);
  }

  /**
   * Stores the player's latest input. `reset` is latched until the next tick: a one-tick R press
   * is never lost when two inputs arrive between ticks, nor repeated when none arrives.
   */
  setInput(id: CarId, input: InputCommand): void {
    if (!this.current.cars.some((car) => car.id === id)) return;
    const pendingReset = this.inputs.get(id)?.reset ?? false;
    this.inputs.set(id, { ...input, reset: input.reset || pendingReset });
  }

  /** One fixed tick of the simulation (nothing to do while nobody is in the room). */
  tick(): void {
    if (this.current.cars.length === 0) return;
    this.current = stepGame(this.current, Object.fromEntries(this.inputs), this.ctx);
    for (const [id, input] of this.inputs) {
      if (input.reset) this.inputs.set(id, { ...input, reset: false });
    }
  }
}
