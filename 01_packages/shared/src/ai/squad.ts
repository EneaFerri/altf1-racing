import { BOT_PARAMS, type BotLevel } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { PIT_PARAMS } from '../config/pit';
import { SLOPE_PARAMS } from '../config/slope';
import { TYRE_PARAMS, type TyreCompound } from '../config/tyres';
import type { WetParams } from '../config/weather';
import type { CarId } from '../sim/car';
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
  readonly plans: { readonly race: BotPlan; readonly pit: BotPlan };
  using: 'race' | 'pit';
  memory: BotMemory;
  stops: number;
  /** The end tick of its last stop counted. */
  lastStop: number | null;
  schedule: readonly number[];
}

/**
 * A bot's tyres at a stop after `laps` laps: softs when the stint ahead (to its next scheduled
 * stop, else the flag) is no longer than they last, else mediums. See 01_docs/tyres.md.
 */
export function botCompound(
  schedule: readonly number[],
  stops: number,
  laps: number,
  raceLaps: number,
): TyreCompound {
  const next = schedule[stops] ?? raceLaps;
  return next - laps <= TYRE_PARAMS.lifeLaps.soft ? 'soft' : 'medium';
}

/**
 * Single player's Grand Prix bots (S.5): drives each in traffic on its race plan, and through the
 * pit lane to its box when one of its mandatory stops is owed (`pitSchedule`, `pitLag` laps later, or
 * earlier when later would fall on the last two, `setRace`). `track` built with its pit lane; `wet` on a wet
 * track. Plans are built once. Pure apart from its own racers' memory.
 * See 01_docs/bot.md#single-player-grand-prix.
 */
export class BotSquad {
  private readonly racers: Racer[];

  private readonly track: Track;

  /** The race's laps; null in qualifying (no stops). */
  private raceLaps: number | null = null;

  constructor(track: Track, bots: readonly SquadBot[], wet?: WetParams) {
    this.track = track;
    const race = new Map<BotLevel, BotPlan>();
    const raceOf = (level: BotLevel): BotPlan => {
      if (!race.has(level)) {
        race.set(level, buildBotPlan(track, CAR_PARAMS, BOT_PARAMS[level], SLOPE_PARAMS, wet));
      }
      return race.get(level)!;
    };
    this.racers = bots.map((bot) => ({
      bot,
      plans: {
        race: raceOf(bot.level),
        pit: buildPitPlan(
          track,
          CAR_PARAMS,
          BOT_PARAMS[bot.level],
          bot.box,
          PIT_PARAMS,
          SLOPE_PARAMS,
          wet,
        ),
      },
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

  /**
   * Each bot on the track's input for the next tick of `state`; while the start lights `held`
   * the cars, none (and no memory: waiting on the grid is not being stuck).
   */
  inputs(state: GameState, held: boolean): Record<CarId, InputCommand> {
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
      // Stopped in its box: its tyres for the stint ahead (the stop just counted).
      if (car.pitStop && state.tick < car.pitStop.until && this.raceLaps !== null) {
        const compound = botCompound(racer.schedule, racer.stops, laps, this.raceLaps);
        if (car.tyres?.compound !== compound || car.tyres.wear > 0) {
          inputs[racer.bot.id] = { ...NEUTRAL_INPUT, compound };
          continue;
        }
      }
      const want = pitDue(racer.schedule, laps, racer.stops) ? 'pit' : 'race';
      if (
        want !== racer.using &&
        canSwitchPlan(this.track, locateOnTrack(this.track, car.position).distance)
      ) {
        racer.using = want;
      }
      const result = botInput(car, racer.plans[racer.using], racer.memory, state.cars);
      racer.memory = result.memory;
      inputs[racer.bot.id] = result.input;
    }
    return inputs;
  }
}
