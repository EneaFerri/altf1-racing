import { BOT_PARAMS, BOT_SLIDE_MARGIN, BOT_TYRE_SWITCH, type BotLevel } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { DAMAGE_PARAMS } from '../config/damage';
import { PIT_PARAMS } from '../config/pit';
import { SLOPE_PARAMS } from '../config/slope';
import {
  isSlick,
  slideFrom,
  TYRE_PARAMS,
  weatherCompound,
  type TyreCompound,
  type TyreParams,
} from '../config/tyres';
import type { WetParams } from '../config/weather';
import { trackWetness, tyreWetParams, type WetTrack } from '../sim/weather';
import type { CarId, CarState } from '../sim/car';
import { length } from '../math/vec2';
import { isPunctured, puncturedTyres } from '../sim/damage';
import { findCar, findLap, type GameState } from '../sim/game';
import { locateOnTrack } from '../track/query';
import type { Track } from '../track/types';
import { NEUTRAL_INPUT, type InputCommand } from '../types/input';
import { botInput, NEW_BOT_MEMORY, type BotMemory } from './driver';
import { buildBotPlan, buildPitPlan, type BotPlan } from './plan';
import { canSwitchPlan, pitDue, pitSchedule } from './pitPlan';

/** One bot of single player's Grand Prix. */
export interface SquadBot {
  readonly id: CarId;
  readonly level: BotLevel;
  /** Its pit box (its team's). */
  readonly box: number;
  /** Laps its stops come later than the schedule's (the second driver of a team sharing a box). */
  readonly pitLag: number;
}

interface Racer {
  readonly bot: SquadBot;
  using: 'race' | 'pit';
  memory: BotMemory;
  stops: number;
  /** The end tick of its last stop counted. */
  lastStop: number | null;
  schedule: readonly number[];
}

/**
 * A bot's tyres at a stop after `laps` laps: softs when the stint ahead (to its next scheduled
 * stop, else the flag) ends before they would wear out to a puncture, else mediums. See
 * 01_docs/tyres.md.
 */
export function botCompound(
  schedule: readonly number[],
  stops: number,
  laps: number,
  raceLaps: number,
): TyreCompound {
  const next = schedule[stops] ?? raceLaps;
  const softLaps = TYRE_PARAMS.lifeLaps.soft * DAMAGE_PARAMS.punctureWear;
  return next - laps < softLaps ? 'soft' : 'medium';
}

/**
 * Whether `compound` no longer suits a track `wetness` wet (2.8, `BOT_TYRE_SWITCH`): slicks in the
 * rain, intermediates on a soaked or a dry track, full wets on a drying one.
 */
export function wrongTyres(compound: TyreCompound, wetness: number): boolean {
  const p = BOT_TYRE_SWITCH;
  if (compound === 'intermediate') {
    return wetness > p.intermediateAbove || wetness < p.intermediateBelow;
  }
  if (compound === 'wet') return wetness < p.wetBelow;
  return wetness > p.slickAbove;
}

/**
 * The wet params a bot plans with on `compound` on a track `wetness` wet (2.8): planned for a
 * little wetter than it is (the next quarter up), and for the compound's own grip; none on slicks
 * on a dry track. Without `tyres` (no compounds), the rain's own `weather.params`.
 */
export function planWet(
  compound: TyreCompound,
  wetness: number,
  weather: WetTrack | undefined,
  tyres: TyreParams | undefined,
): { readonly key: string; readonly wet: WetParams | undefined } {
  const quarter = Math.ceil(wetness * 4) / 4;
  if (!weather || quarter === 0) {
    if (!tyres || isSlick(compound)) return { key: 'dry', wet: undefined };
  }
  if (!tyres) return { key: 'rain', wet: weather!.params };
  const params = weather?.params;
  const base = tyreWetParams(compound, quarter, tyres, params ?? NO_PUDDLE_DRAG);
  const kind = isSlick(compound) ? 'slick' : compound;
  return { key: `${kind}:${quarter}`, wet: { ...base, grip: base.grip * tyres.grip[compound] } };
}

/**
 * A bot's `input` on a track `wetness` wet (2.8): off the throttle once its cornering load (speed ×
 * turn rate) reaches `BOT_SLIDE_MARGIN` of where its tyres' rear breaks loose (`slideFrom`), so it
 * never spins itself round. Unchanged when dry or without tyres.
 */
export function wetLift(
  car: CarState,
  input: InputCommand,
  wetness: number,
  tyres: TyreParams | undefined,
): InputCommand {
  if (!tyres || wetness <= 0 || input.throttle <= 0) return input;
  const limit = slideFrom(car.tyres?.compound ?? 'medium', wetness, tyres);
  const load = Math.abs(car.yawRate + car.spin) * length(car.velocity);
  return load >= limit * BOT_SLIDE_MARGIN ? { ...input, throttle: 0 } : input;
}

/** Wet params' puddle drag when there are no puddles (rain tyres on a dry track). */
const NO_PUDDLE_DRAG: WetParams = {
  grip: 1,
  traction: 1,
  brake: 1,
  puddleGrip: 1,
  puddleTraction: 1,
  puddleDrag: 0,
};

/**
 * Single player's Grand Prix bots (S.5): drives each in traffic on its race plan, and through the
 * pit lane to its box when one of its mandatory stops is owed (`pitSchedule`, `pitLag` laps later, or
 * earlier when later would fall on the last two, `setRace`), a tyre is flat or its tyres no longer
 * suit the weather (2.8, `wrongTyres`). `track` built with its pit lane. Each plan is built the
 * first time a bot needs it: for its level (its box), its tyres and how wet the track is
 * (`planWet`). Pure apart from its own racers' memory and plans.
 * See 01_docs/bot.md#single-player-grand-prix.
 */
export class BotSquad {
  private readonly racers: Racer[];

  private readonly track: Track;

  /** The race's laps; null in qualifying (no stops). */
  private raceLaps: number | null = null;

  /** Plans built so far, by road, level (and box), tyres and wetness. */
  private readonly plans = new Map<string, BotPlan>();

  constructor(track: Track, bots: readonly SquadBot[]) {
    this.track = track;
    this.racers = bots.map((bot) => ({
      bot,
      using: 'race',
      memory: NEW_BOT_MEMORY,
      stops: 0,
      lastStop: null,
      schedule: [],
    }));
  }

  /** A new race over `raceLaps` laps (null: no race, no stops: qualifying): stops counted afresh. */
  setRace(raceLaps: number | null): void {
    this.raceLaps = raceLaps;
    const base = raceLaps === null ? [] : pitSchedule(raceLaps);
    for (const racer of this.racers) {
      const latest = (raceLaps ?? 0) - 2;
      racer.schedule = base.map((after) => {
        // Later by its lag if that is still before the last two laps, else earlier.
        const { pitLag } = racer.bot;
        return after + pitLag <= latest ? after + pitLag : Math.max(1, after - pitLag);
      });
      racer.stops = 0;
      racer.lastStop = null;
      racer.using = 'race';
      racer.memory = NEW_BOT_MEMORY;
    }
  }

  /** `racer`'s plan for `using` with `wet` (`key`): built the first time. */
  private plan(
    racer: Racer,
    using: 'race' | 'pit',
    key: string,
    wet: WetParams | undefined,
  ): BotPlan {
    const { level, box } = racer.bot;
    const id = using === 'race' ? `race:${level}:${key}` : `pit:${level}:${box}:${key}`;
    let plan = this.plans.get(id);
    if (!plan) {
      plan =
        using === 'race'
          ? buildBotPlan(this.track, CAR_PARAMS, BOT_PARAMS[level], SLOPE_PARAMS, wet)
          : buildPitPlan(
              this.track,
              CAR_PARAMS,
              BOT_PARAMS[level],
              box,
              PIT_PARAMS,
              SLOPE_PARAMS,
              wet,
            );
      this.plans.set(id, plan);
    }
    return plan;
  }

  /**
   * Each bot on the track's input for the next tick of `state`, on a track as wet as `weather` says
   * (with `tyres`: each on its compound); while the start lights `held` the cars, none (and no
   * memory: waiting on the grid is not being stuck).
   */
  inputs(
    state: GameState,
    held: boolean,
    weather?: WetTrack,
    tyres?: TyreParams,
  ): Record<CarId, InputCommand> {
    const wetness = trackWetness(weather, state.tick);
    const inputs: Record<CarId, InputCommand> = {};
    for (const racer of this.racers) {
      const car = findCar(state, racer.bot.id);
      if (!car) continue;
      if (car.pitStop && car.pitStop.until !== racer.lastStop) {
        racer.lastStop = car.pitStop.until;
        racer.stops++;
      }
      if (held) {
        racer.memory = NEW_BOT_MEMORY;
        inputs[racer.bot.id] = NEUTRAL_INPUT;
        continue;
      }
      const laps = findLap(state, racer.bot.id)?.laps ?? 0;
      // Stopped in its box: its tyres for the stint ahead (the stop just counted), the weather's.
      if (car.pitStop && state.tick < car.pitStop.until && this.raceLaps !== null) {
        const wanted = tyres ? weatherCompound(wetness, tyres) : 'medium';
        const compound =
          wanted === 'medium'
            ? botCompound(racer.schedule, racer.stops, laps, this.raceLaps)
            : wanted;
        if (car.tyres?.compound !== compound || car.tyres.wear > 0) {
          inputs[racer.bot.id] = { ...NEUTRAL_INPUT, compound };
          continue;
        }
      }
      // A flat tyre (only in a race with damage, the one with `car.damage`): to the pits now.
      const flat =
        car.damage !== undefined &&
        isPunctured(puncturedTyres(car.damage, car.tyres, DAMAGE_PARAMS));
      const compound = car.tyres?.compound ?? 'medium';
      const weatherStop =
        tyres !== undefined && this.raceLaps !== null && wrongTyres(compound, wetness);
      const owed = pitDue(racer.schedule, laps, racer.stops);
      const want = flat || owed || weatherStop ? 'pit' : 'race';
      if (
        want !== racer.using &&
        canSwitchPlan(this.track, locateOnTrack(this.track, car.position).distance)
      ) {
        racer.using = want;
      }
      const { key, wet } = planWet(compound, wetness, weather, tyres);
      const plan = this.plan(racer, racer.using, key, wet);
      const result = botInput(car, plan, racer.memory, state.cars);
      racer.memory = result.memory;
      inputs[racer.bot.id] = wetLift(car, result.input, wetness, tyres);
    }
    return inputs;
  }
}
