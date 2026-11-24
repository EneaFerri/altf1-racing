import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { PIT_PARAMS } from '../config/pit';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import { TYRE_PARAMS as P } from '../config/tyres';
import { headingOf, scale } from '../math/vec2';
import { buildTrack } from '../track/buildTrack';
import { MONZA } from '../track/layouts';
import { NEUTRAL_INPUT } from '../types/input';
import { botCompound } from '../ai/squad';
import { createGame, findCar, stepGame, type GameState, type SimContext } from './game';
import { fitTyres, NEW_MEDIUMS, tyredParams, wearTyres } from './tyres';

const track = buildTrack(MONZA, { pitLane: true });
const road = track.routes.find((r) => r.pit)!;
const base: SimContext = {
  track,
  carParams: CAR_PARAMS,
  surfaceParams: SURFACE_PARAMS,
  collisionParams: COLLISION_PARAMS,
  slipstreamParams: SLIPSTREAM_PARAMS,
  pit: { params: PIT_PARAMS, boxes: { p1: 0 } },
};
const ctx: SimContext = { ...base, tyres: P };
const THROTTLE = { ...NEUTRAL_INPUT, throttle: 1 };

function run(state: GameState, ticks: number, input = THROTTLE, context = ctx): GameState {
  for (let i = 0; i < ticks; i++) state = stepGame(state, { p1: input }, context);
  return state;
}

describe('tyres', () => {
  it('softs grip, turn and pull harder than mediums; worn tyres less', () => {
    const soft = tyredParams(CAR_PARAMS, fitTyres('soft'), P);
    const medium = tyredParams(CAR_PARAMS, NEW_MEDIUMS, P);
    const worn = tyredParams(CAR_PARAMS, { compound: 'medium', wear: 1 }, P);
    expect(medium).toEqual(CAR_PARAMS);
    expect(soft.lateralGrip).toBeCloseTo(CAR_PARAMS.lateralGrip * 1.05);
    expect(soft.maxYawRate).toBeCloseTo(CAR_PARAMS.maxYawRate * 1.05);
    expect(soft.engineAccel).toBeCloseTo(CAR_PARAMS.engineAccel * 1.05);
    expect(worn.lateralGrip).toBeCloseTo(CAR_PARAMS.lateralGrip * 0.9);
    expect(worn.engineAccel).toBeCloseTo(CAR_PARAMS.engineAccel * 0.9);
  });

  it('wear out in their life: softs in 4 laps, mediums in 9', () => {
    const lap = track.length;
    expect(wearTyres(fitTyres('soft'), 2 * lap, lap, P).wear).toBeCloseTo(0.5);
    expect(wearTyres(NEW_MEDIUMS, 3 * lap, lap, P).wear).toBeCloseTo(1 / 3);
    expect(wearTyres(fitTyres('soft'), 10 * lap, lap, P).wear).toBe(1);
  });

  it('wear as the car drives, only in a race with tyres', () => {
    const driven = run(createGame(track, ['p1']), 600);
    const tyres = findCar(driven, 'p1')!.tyres!;
    expect(tyres.compound).toBe('medium');
    expect(tyres.wear).toBeGreaterThan(0);
    expect(
      findCar(run(createGame(track, ['p1']), 600, THROTTLE, base), 'p1')!.tyres,
    ).toBeUndefined();
  });

  it('let softs out-accelerate mediums', () => {
    const start = createGame(track, ['p1']);
    const onSofts: GameState = { ...start, cars: [{ ...start.cars[0]!, tyres: fitTyres('soft') }] };
    const speed = (s: GameState) =>
      Math.hypot(findCar(s, 'p1')!.velocity.x, findCar(s, 'p1')!.velocity.z);
    expect(speed(run(onSofts, 120))).toBeGreaterThan(speed(run(start, 120)));
  });

  it('are changed in the box: the chosen compound, new; a stop alone fits the same compound new', () => {
    const at = road.pitRules!.boxes[0]!;
    const s = road.samples.find((x) => x.distance >= at)!;
    const game = createGame(track, ['p1']);
    const arriving: GameState = {
      ...game,
      cars: [
        {
          ...game.cars[0]!,
          position: s.position,
          heading: headingOf(s.tangent),
          velocity: scale(s.tangent, 2),
          tyres: { compound: 'medium', wear: 0.7 },
        },
      ],
    };
    const stopped = run(arriving, 2, NEUTRAL_INPUT);
    const car = findCar(stopped, 'p1')!;
    expect(car.pitStop).toBeDefined();
    expect(car.tyres).toEqual(NEW_MEDIUMS);
    const chosen = stepGame(stopped, { p1: { ...NEUTRAL_INPUT, compound: 'soft' } }, ctx);
    expect(findCar(chosen, 'p1')!.tyres).toEqual(fitTyres('soft'));
    // Ignored while driving.
    const driving = stepGame(
      createGame(track, ['p1']),
      { p1: { ...THROTTLE, compound: 'soft' } },
      ctx,
    );
    expect(findCar(driving, 'p1')!.tyres!.compound).toBe('medium');
  });

  it('stay on through a reset (R)', () => {
    const worn = run(createGame(track, ['p1']), 300);
    const reset = stepGame(worn, { p1: { ...NEUTRAL_INPUT, reset: true } }, ctx);
    expect(findCar(reset, 'p1')!.tyres).toEqual(findCar(worn, 'p1')!.tyres);
  });

  it('bots fit softs for a stint no longer than they last, else mediums', () => {
    // Stops after laps 4 and 8 of 12.
    expect(botCompound([4, 8], 1, 4, 12)).toBe('soft');
    expect(botCompound([4, 8], 2, 8, 12)).toBe('soft');
    expect(botCompound([3], 1, 3, 12)).toBe('medium');
  });
});
