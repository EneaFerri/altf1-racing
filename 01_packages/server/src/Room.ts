import {
  buildTrack,
  createGame,
  heldInputs,
  NEUTRAL_INPUT,
  onlineSimContext,
  removeCar,
  repairCars,
  spawnOnGrid,
  stepGame,
  type BuildOptions,
  type CarId,
  type GameState,
  type InputCommand,
  type SimContext,
  type StartHold,
  type Track,
  type TrackDefinition,
} from '@altf1/shared';

/**
 * Inputs are run on a timeline: every tick runs the input of one `seq` slot, there or not, so the
 * server always runs as many inputs as the client simulated (see 01_docs/multiplayer.md#rooms).
 * A slot whose input hasn't arrived repeats the last one; it arrives late and is thrown away.
 * How far the slots run behind the client's newest input (the jitter buffer) adapts one tick at a
 * time: these numbers say when.
 */
/** Ticks per adaptation window (0.5 s). */
export const WINDOW_TICKS = 30;
/** Missed slots in one window that make the buffer one tick longer. */
export const GROW_MISSES = 2;
/** Longest the buffer grows to (ticks, 250 ms): beyond, misses come from stalls no buffer absorbs. */
export const MAX_DELAY_TICKS = 15;
/** Inputs always waiting (incl. the one due) in a whole window that count as too many. */
export const SHRINK_LEAD = 3;
/** Windows in a row with too many waiting and no miss that make the buffer one tick shorter. */
export const SHRINK_WINDOWS = 3;
/** Arrivals this many ticks off the timeline (behind or ahead) are a clock jump, not jitter. */
export const RESYNC_TICKS = 30;
/** Ticks in a row with arrivals that far off before the timeline jumps to the client's clock. */
export const RESYNC_CONFIRM = 30;

/** A player's input timeline. */
interface InputTimeline {
  /** Inputs that arrived for slots not run yet, by `seq`. */
  readonly waiting: Map<number, InputCommand>;
  /** The slot the next tick runs; null before the first input. */
  next: number | null;
  /** Newest `seq` received; -1 before any. */
  newest: number;
  /** The last input run (repeated for a missed slot, without its reset). */
  last: InputCommand;
  /** `seq` of the last slot run; -1 before any. */
  ack: number;
  /** A reset that came in a late or skipped input: applied with the next input run. */
  reset: boolean;
  /** Ticks the buffer grew minus ticks it shrank (capped at MAX_DELAY_TICKS). */
  delay: number;
  /** Next tick waits instead of running a slot (the buffer grows). */
  hold: boolean;
  /** This window: ticks so far, missed slots, fewest inputs waiting. */
  windowTicks: number;
  misses: number;
  minLead: number;
  /** Windows in a row that had too many inputs waiting and no miss. */
  calmWindows: number;
  /** Newest `seq` arrived since the last tick; null if none did. */
  arrived: number | null;
  /** Ticks in a row whose arrivals were more than RESYNC_TICKS off the timeline. */
  offTicks: number;
}

function newTimeline(): InputTimeline {
  return {
    waiting: new Map(),
    next: null,
    newest: -1,
    last: NEUTRAL_INPUT,
    ack: -1,
    reset: false,
    delay: 0,
    hold: false,
    windowTicks: 0,
    misses: 0,
    minLead: Infinity,
    calmWindows: 0,
    arrived: null,
    offTicks: 0,
  };
}

/**
 * One multiplayer race: the authoritative simulation of a track with every player's car. Each
 * tick runs exactly one queued input per player, the one its client simulated for that tick.
 * Pure (no sockets, no timers). See 01_docs/multiplayer.md#rooms.
 */
export class Room {
  readonly definition: TrackDefinition;
  private readonly track: Track;
  private ctx: SimContext;
  private current: GameState = { tick: 0, cars: [], impacts: [], laps: [] };
  private readonly queues = new Map<CarId, InputTimeline>();
  /** Cars held on the grid until lights out (a Grand Prix start); null = free to drive. */
  hold: StartHold | null = null;

  /** `options`: a Grand Prix's room drives the pit lane (`pitLane`). */
  constructor(definition: TrackDefinition, options: BuildOptions = {}) {
    this.definition = definition;
    this.track = buildTrack(definition, options);
    this.ctx = onlineSimContext(this.track);
  }

  /** Whether cars take damage (a Grand Prix in qualifying or the race); off by default. */
  get damage(): boolean {
    return this.ctx.damage !== undefined;
  }

  /** Damage on or off from the next tick (the Grand Prix's phases); off repairs every car. */
  setDamage(on: boolean): void {
    if (on === this.damage) return;
    this.ctx = onlineSimContext(this.track, { damage: on, pitBoxes: this.ctx.pit?.boxes });
    if (!on) this.current = repairCars(this.current);
  }

  /** Each driver's pit box (a Grand Prix room, whose track has the pit lane). */
  setPitBoxes(boxes: Readonly<Record<CarId, number>>): void {
    this.ctx = onlineSimContext(this.track, { damage: this.damage, pitBoxes: boxes });
  }

  /** No players left (cars out of the race still count: their players are watching). */
  get isEmpty(): boolean {
    return this.queues.size === 0;
  }

  /** Whether `id`'s car is in this room. */
  has(id: CarId): boolean {
    return this.current.cars.some((car) => car.id === id);
  }

  get state(): GameState {
    return this.current;
  }

  /** A new player: their car on the first free grid slot. */
  add(id: CarId): void {
    this.spawn(id);
    this.queues.set(id, newTimeline());
  }

  /** Puts the car of `id` (a player already in the room) on the first free grid slot, at rest. */
  spawn(id: CarId): void {
    this.current = spawnOnGrid(this.current, this.track, id);
  }

  /**
   * Every car back on the grid in `order` (first = pole), at rest, with fresh timing; the cars of
   * players not in `order` leave the track. The tick count goes on.
   */
  restart(order: readonly CarId[]): void {
    this.current = { ...createGame(this.track, order), tick: this.current.tick };
  }

  /** Takes the player's car off the track; the player stays (watching, inputs still acked). */
  retire(id: CarId): void {
    this.current = removeCar(this.current, id);
  }

  remove(id: CarId): void {
    this.current = removeCar(this.current, id);
    this.queues.delete(id);
  }

  /**
   * The player's input number `seq` for its slot on the timeline. A duplicate is ignored; one whose
   * slot already ran (late) is thrown away, but its reset rides on the next input, so R is never lost.
   */
  queueInput(id: CarId, seq: number, input: InputCommand): void {
    const queue = this.queues.get(id);
    if (!queue) return;
    queue.next ??= seq;
    queue.newest = Math.max(queue.newest, seq);
    queue.arrived = Math.max(queue.arrived ?? seq, seq);
    if (seq < queue.next) {
      if (input.reset) queue.reset = true;
      return;
    }
    if (!queue.waiting.has(seq)) queue.waiting.set(seq, input);
  }

  /** Per player, the `seq` of the last input its car ran (players with none run yet are absent). */
  get acks(): Record<CarId, number> {
    const acks: Record<CarId, number> = {};
    for (const [id, queue] of this.queues) if (queue.ack >= 0) acks[id] = queue.ack;
    return acks;
  }

  /** Per player, the input its car ran in the last tick (players with none run yet are absent). */
  get lastInputs(): Record<CarId, InputCommand> {
    const inputs: Record<CarId, InputCommand> = {};
    for (const [id, queue] of this.queues) if (queue.ack >= 0) inputs[id] = queue.last;
    return inputs;
  }

  /**
   * One fixed tick of the simulation (nothing to do while nobody is in the room). Each player runs
   * the input of its next slot, or repeats its last one (never its reset) if that hasn't arrived;
   * a `hold` makes them all neutral.
   */
  tick(): void {
    if (this.isEmpty) return;
    const inputs: Record<CarId, InputCommand> = {};
    for (const [id, queue] of this.queues) inputs[id] = runSlot(queue);
    this.current = stepGame(
      this.current,
      heldInputs(inputs, this.current.tick, this.hold),
      this.ctx,
    );
  }
}

/** Moves the timeline one tick on: the input this tick runs. */
function runSlot(queue: InputTimeline): InputCommand {
  if (queue.next === null) return queue.last; // no input yet: neutral
  resyncIfOff(queue);
  const next = queue.next;
  if (queue.hold) {
    queue.hold = false; // the buffer grows: this slot waits a tick
    queue.last = { ...queue.last, reset: false };
    return queue.last;
  }
  const lead = queue.newest - next + 1;
  queue.minLead = Math.min(queue.minLead, lead);
  const input = queue.waiting.get(next);
  queue.waiting.delete(next);
  if (input === undefined) queue.misses++;
  const run = input ?? { ...queue.last, reset: false };
  queue.last = queue.reset ? { ...run, reset: true } : run;
  queue.reset = false;
  queue.ack = next;
  queue.next = next + 1;
  adapt(queue);
  return queue.last;
}

/**
 * After a clock jump (a tab that stopped ticking, a server stall), arrivals stay far off the
 * timeline: once they have for RESYNC_CONFIRM ticks, the timeline restarts at the newest input.
 */
function resyncIfOff(queue: InputTimeline): void {
  const { arrived, next } = queue;
  queue.arrived = null;
  if (arrived === null || next === null) return;
  const off = arrived - next;
  queue.offTicks = off < -RESYNC_TICKS || off > RESYNC_TICKS ? queue.offTicks + 1 : 0;
  if (queue.offTicks < RESYNC_CONFIRM) return;
  for (const [seq, input] of queue.waiting) {
    if (seq >= arrived) continue;
    if (input.reset) queue.reset = true;
    queue.waiting.delete(seq);
  }
  queue.next = arrived;
  queue.offTicks = 0;
  queue.delay = 0;
  startWindow(queue);
  queue.calmWindows = 0;
}

/** At the end of a window: one tick more buffer after misses, one less after a calm stretch. */
function adapt(queue: InputTimeline): void {
  if (++queue.windowTicks < WINDOW_TICKS) return;
  const { misses, minLead } = queue;
  startWindow(queue);
  if (misses >= GROW_MISSES) {
    queue.calmWindows = 0;
    if (queue.delay < MAX_DELAY_TICKS) {
      queue.delay++;
      queue.hold = true;
    }
    return;
  }
  queue.calmWindows = misses === 0 && minLead >= SHRINK_LEAD ? queue.calmWindows + 1 : 0;
  if (queue.calmWindows < SHRINK_WINDOWS || queue.next === null) return;
  queue.calmWindows = 0;
  queue.delay = Math.max(queue.delay - 1, -MAX_DELAY_TICKS);
  const skipped = queue.waiting.get(queue.next);
  if (skipped?.reset) queue.reset = true;
  queue.waiting.delete(queue.next);
  queue.next++;
}

function startWindow(queue: InputTimeline): void {
  queue.windowTicks = 0;
  queue.misses = 0;
  queue.minLead = Infinity;
}
