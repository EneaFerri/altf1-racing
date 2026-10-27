import {
  buildTrack,
  CAR_PARAMS,
  COLLISION_PARAMS,
  NEUTRAL_INPUT,
  removeCar,
  SLIPSTREAM_PARAMS,
  spawnOnGrid,
  stepGame,
  SURFACE_PARAMS,
  type CarId,
  type GameState,
  type InputCommand,
  type SimContext,
  type Track,
  type TrackDefinition,
} from '@altf1/shared';

/**
 * Inputs a player may have waiting (ticks, ~100 ms). Past this the oldest are dropped, so a burst
 * after a network hiccup never leaves the car running late for good.
 */
export const MAX_QUEUED_INPUTS = 6;

/** A player's inputs: the ones waiting, and the last one run (repeated while none waits). */
interface InputQueue {
  readonly waiting: { readonly seq: number; readonly input: InputCommand }[];
  last: InputCommand;
  /** `seq` of the last input run; -1 before any. */
  ack: number;
}

/**
 * One multiplayer race: the authoritative simulation of a track with every player's car. Each
 * tick runs exactly one queued input per player, the one its client simulated for that tick.
 * Pure (no sockets, no timers). See 01_docs/multiplayer.md#rooms.
 */
export class Room {
  readonly definition: TrackDefinition;
  private readonly track: Track;
  private readonly ctx: SimContext;
  private current: GameState = { tick: 0, cars: [], impacts: [], laps: [] };
  private readonly queues = new Map<CarId, InputQueue>();

  constructor(definition: TrackDefinition) {
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

  get isEmpty(): boolean {
    return this.current.cars.length === 0;
  }

  /** Whether `id`'s car is in this room. */
  has(id: CarId): boolean {
    return this.current.cars.some((car) => car.id === id);
  }

  get state(): GameState {
    return this.current;
  }

  /** Puts the player's car on the first free grid slot. */
  add(id: CarId): void {
    this.current = spawnOnGrid(this.current, this.track, id);
    this.queues.set(id, { waiting: [], last: NEUTRAL_INPUT, ack: -1 });
  }

  remove(id: CarId): void {
    this.current = removeCar(this.current, id);
    this.queues.delete(id);
  }

  /**
   * Queues the player's input number `seq`. One that isn't newer than the last queued or run is
   * ignored (duplicate or stale). A dropped input's reset rides on the next one, so R is never lost.
   */
  queueInput(id: CarId, seq: number, input: InputCommand): void {
    const queue = this.queues.get(id);
    if (!queue || seq <= (queue.waiting.at(-1)?.seq ?? queue.ack)) return;
    queue.waiting.push({ seq, input });
    while (queue.waiting.length > MAX_QUEUED_INPUTS) {
      const dropped = queue.waiting.shift()!;
      const next = queue.waiting[0]!;
      if (dropped.input.reset)
        queue.waiting[0] = { ...next, input: { ...next.input, reset: true } };
    }
  }

  /** Per player, the `seq` of the last input its car ran (players with none run yet are absent). */
  get acks(): Record<CarId, number> {
    const acks: Record<CarId, number> = {};
    for (const [id, queue] of this.queues) if (queue.ack >= 0) acks[id] = queue.ack;
    return acks;
  }

  /**
   * One fixed tick of the simulation (nothing to do while nobody is in the room). Each player runs
   * its next queued input, or repeats its last one (never its reset) if none is waiting.
   */
  tick(): void {
    if (this.isEmpty) return;
    const inputs: Record<CarId, InputCommand> = {};
    for (const [id, queue] of this.queues) {
      const next = queue.waiting.shift();
      if (next) {
        queue.ack = next.seq;
        queue.last = next.input;
      } else {
        queue.last = { ...queue.last, reset: false };
      }
      inputs[id] = queue.last;
    }
    this.current = stepGame(this.current, inputs, this.ctx);
  }
}
