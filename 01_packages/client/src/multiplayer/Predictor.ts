import {
  add,
  distance,
  findCar,
  length,
  scale,
  stepGame,
  sub,
  wrapAngle,
  type CarId,
  type GameState,
  type InputCommand,
  type InputMap,
  type ServerMessage,
  type SimContext,
  type Vec2,
} from '@altf1/shared';

export type Snapshot = Extract<ServerMessage, { type: 'snapshot' }>;

/** Inputs kept for replay at most (2 s): older ones the server has surely run or dropped. */
const MAX_PENDING = 120;
/** A correction bigger than this (m) is shown at once instead of faded out (crash, reset). */
export const SNAP_DISTANCE = 4;
/** How quickly a correction fades out (1/s): ~90% gone in 0.25 s. */
const CORRECTION_RATE = 10;
/** Below this (m, rad) a correction is gone. */
const NEGLIGIBLE = 1e-3;

/** What is still added to a car's drawn pose after a correction. */
interface Offset {
  readonly position: Vec2;
  readonly heading: number;
}

/**
 * Client-side prediction of the whole room. Every client tick moves the world one tick on: this
 * player's car with its own input (so it responds at once), the other cars with the last input
 * the server saw from them. Every snapshot restarts from the server's state and replays the inputs
 * the server hasn't run yet; the jump this causes on screen fades out (`decay`) unless it is big.
 * Pure: no network, no clock. See 01_docs/multiplayer.md#prediction-22.
 */
export class Predictor {
  /** Predicted state now, and one tick before (for interpolation); null before the first snapshot with this car. */
  private world: GameState | null = null;
  private previous: GameState | null = null;
  /** This player's inputs the server hasn't run yet, oldest first. */
  private pending: { readonly seq: number; readonly input: InputCommand }[] = [];
  /** The other cars' last inputs (from the newest snapshot), without reset. */
  private remoteInputs: Record<CarId, InputCommand> = {};
  private readonly offsets = new Map<CarId, Offset>();
  private correction = 0;

  constructor(
    private readonly playerId: CarId,
    private readonly ctx: SimContext,
  ) {}

  /** One client tick: input number `seq` (also sent to the server) moves the predicted world. */
  step(seq: number, input: InputCommand): void {
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (!this.world) return;
    this.previous = this.world;
    this.world = stepGame(this.world, this.inputs(input), this.ctx);
  }

  /** Restarts from the server's snapshot and replays this player's inputs it hasn't run yet. */
  reconcile(snapshot: Snapshot): void {
    const ack = snapshot.acks[this.playerId] ?? -1;
    this.pending = this.pending.filter((p) => p.seq > ack);
    this.remoteInputs = {};
    for (const [id, input] of Object.entries(snapshot.inputs)) {
      if (id !== this.playerId) this.remoteInputs[id] = { ...input, reset: false };
    }
    if (!findCar(snapshot.state, this.playerId)) {
      this.world = this.previous = null; // not in the race yet (or any more)
      this.offsets.clear();
      return;
    }
    let previous = snapshot.state;
    let world = snapshot.state;
    for (const { input } of this.pending) {
      previous = world;
      world = stepGame(world, this.inputs(input), this.ctx);
    }
    this.keepOnScreen(world);
    this.previous = previous;
    this.world = world;
  }

  /** Fades the corrections out by `seconds` of real time (once per frame). */
  decay(seconds: number): void {
    const keep = Math.exp(-CORRECTION_RATE * seconds);
    for (const [id, { position, heading }] of this.offsets) {
      const offset = { position: scale(position, keep), heading: heading * keep };
      if (length(offset.position) < NEGLIGIBLE && Math.abs(offset.heading) < NEGLIGIBLE) {
        this.offsets.delete(id);
      } else {
        this.offsets.set(id, offset);
      }
    }
  }

  /** The predicted world as it should be drawn (corrections still fading); null before the first snapshot. */
  get current(): GameState | null {
    return this.world && this.shown(this.world);
  }

  /** The drawn world one tick before `current`, for interpolation. */
  get before(): GameState | null {
    const state = this.previous ?? this.world;
    return state && this.shown(state);
  }

  /** How far the last snapshot moved this player's car from where it was predicted (m). */
  get lastCorrection(): number {
    return this.correction;
  }

  /** Ticks predicted ahead of the newest snapshot (this player's inputs the server hasn't run). */
  get ahead(): number {
    return this.pending.length;
  }

  private inputs(own: InputCommand): InputMap {
    return { ...this.remoteInputs, [this.playerId]: own };
  }

  /**
   * Turns the jump from the old prediction to `next` into offsets, so every car stays where it was
   * drawn and then glides to its corrected place; a big jump is shown at once.
   */
  private keepOnScreen(next: GameState): void {
    if (!this.world) return;
    for (const car of next.cars) {
      const old = findCar(this.world, car.id);
      if (!old) continue;
      if (car.id === this.playerId) this.correction = distance(old.position, car.position);
      const offset = this.offsets.get(car.id);
      const drawn = offset ? add(old.position, offset.position) : old.position;
      const position = sub(drawn, car.position);
      if (length(position) > SNAP_DISTANCE) {
        this.offsets.delete(car.id);
        continue;
      }
      const heading = wrapAngle(old.heading + (offset?.heading ?? 0) - car.heading);
      this.offsets.set(car.id, { position, heading });
    }
  }

  private shown(state: GameState): GameState {
    if (this.offsets.size === 0) return state;
    const cars = state.cars.map((car) => {
      const offset = this.offsets.get(car.id);
      if (!offset) return car;
      return {
        ...car,
        position: add(car.position, offset.position),
        heading: car.heading + offset.heading,
      };
    });
    return { ...state, cars };
  }
}
