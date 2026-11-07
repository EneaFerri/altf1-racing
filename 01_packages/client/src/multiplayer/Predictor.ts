import {
  add,
  DAMAGE_PARAMS,
  distance,
  findCar,
  heldInputs,
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
  type StartHold,
  type Vec2,
} from '@altf1/shared';

export type Snapshot = Extract<ServerMessage, { type: 'snapshot' }>;

/** Inputs kept for replay at most (2 s): older ones the server has surely run or dropped. */
const MAX_PENDING = 120;
/** A correction bigger than this (m) is shown at once instead of faded out (crash, reset). */
export const SNAP_DISTANCE = 4;
/**
 * Another car's correction is shown at once only past what it covers in this long (s), and never
 * under SNAP_DISTANCE: at speed, a late snapshot moves it by metres that are better glided (a
 * car reset is at rest, so it still jumps at once).
 */
export const REMOTE_SNAP_SECONDS = 0.35;
/** How quickly the own car's correction fades out (1/s): ~90% gone in 0.25 s. */
const CORRECTION_RATE = 10;
/** The other cars' (1/s): ~90% gone in 0.4 s, so the glide hides their frequent corrections. */
const REMOTE_CORRECTION_RATE = 6;
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
 * the server hasn't run yet; the jump this causes on screen fades out (`decay`) unless it is big
 * (for the other cars: big for their speed).
 * Pure: no network, no clock. See 01_docs/multiplayer.md#prediction-22.
 */
export class Predictor {
  /**
   * Predicted state now, and one tick before (for interpolation); null before the first snapshot.
   * This player's car may be missing (off the track in a Grand Prix): the others are still predicted.
   */
  private world: GameState | null = null;
  private previous: GameState | null = null;
  /** This player's inputs the server hasn't run yet, oldest first. */
  private pending: { readonly seq: number; readonly input: InputCommand }[] = [];
  /** The other cars' last inputs (from the newest snapshot), without reset. */
  private remoteInputs: Record<CarId, InputCommand> = {};
  private readonly offsets = new Map<CarId, Offset>();
  private correction = 0;
  /** The room's start hold (Grand Prix), applied like the server does; null = none. */
  hold: StartHold | null = null;

  /** What the prediction runs: `ctx`, with damage while the room has it (`setDamage`). */
  private sim: SimContext;

  constructor(
    private readonly playerId: CarId,
    private readonly ctx: SimContext,
  ) {
    this.sim = ctx;
  }

  /**
   * Damage on or off, as the server's room has it (a Grand Prix in qualifying or the race,
   * `damageInPhase`). The snapshots bring the damage itself; this only predicts it in between.
   */
  setDamage(on: boolean): void {
    this.damage = on;
    this.rebuild();
  }

  /** Each driver's pit box, as the server's room has them (a Grand Prix with its pit lane). */
  setPitBoxes(boxes: Readonly<Record<CarId, number>>): void {
    this.boxes = boxes;
    this.rebuild();
  }

  private damage = false;
  private boxes: Readonly<Record<CarId, number>> = {};

  private rebuild(): void {
    const { pit } = this.ctx;
    this.sim = {
      ...this.ctx,
      ...(this.damage && { damage: DAMAGE_PARAMS }),
      ...(pit && { pit: { ...pit, boxes: this.boxes } }),
    };
  }

  /** One client tick: input number `seq` (also sent to the server) moves the predicted world. */
  step(seq: number, input: InputCommand): void {
    this.pending.push({ seq, input });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (!this.world) return;
    this.previous = this.world;
    this.world = stepGame(this.world, this.inputs(input, this.world.tick), this.sim);
  }

  /** Restarts from the server's snapshot and replays this player's inputs it hasn't run yet. */
  reconcile(snapshot: Snapshot): void {
    const ack = snapshot.acks[this.playerId] ?? -1;
    this.pending = this.pending.filter((p) => p.seq > ack);
    this.remoteInputs = {};
    for (const [id, input] of Object.entries(snapshot.inputs)) {
      if (id !== this.playerId) this.remoteInputs[id] = { ...input, reset: false };
    }
    let previous = snapshot.state;
    let world = snapshot.state;
    for (const { input } of this.pending) {
      previous = world;
      world = stepGame(world, this.inputs(input, world.tick), this.sim);
    }
    this.keepOnScreen(world);
    this.previous = previous;
    this.world = world;
  }

  /** Fades the corrections out by `seconds` of real time (once per frame). */
  decay(seconds: number): void {
    const keepOwn = Math.exp(-CORRECTION_RATE * seconds);
    const keepOther = Math.exp(-REMOTE_CORRECTION_RATE * seconds);
    for (const [id, { position, heading }] of this.offsets) {
      const keep = id === this.playerId ? keepOwn : keepOther;
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

  /** Every car's input for the step from `tick`, all neutral while the start hold lasts. */
  private inputs(own: InputCommand, tick: number): InputMap {
    return heldInputs({ ...this.remoteInputs, [this.playerId]: own }, tick, this.hold);
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
      if (length(position) > this.snapDistance(car.id, length(car.velocity))) {
        this.offsets.delete(car.id);
        continue;
      }
      const heading = wrapAngle(old.heading + (offset?.heading ?? 0) - car.heading);
      this.offsets.set(car.id, { position, heading });
    }
  }

  /** How big a correction of `id`'s car going at `speed` (m/s) is shown at once (m). */
  private snapDistance(id: CarId, speed: number): number {
    if (id === this.playerId) return SNAP_DISTANCE;
    return Math.max(SNAP_DISTANCE, speed * REMOTE_SNAP_SECONDS);
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
