import { describe, expect, it } from 'vitest';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { DAMAGE_PARAMS } from '../config/damage';
import { PIT_PARAMS as P } from '../config/pit';
import { TICK_RATE } from '../config/sim';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import { distance, headingOf, length, scale } from '../math/vec2';
import { buildTrack } from '../track/buildTrack';
import { MONZA } from '../track/layouts';
import { NEUTRAL_INPUT } from '../types/input';
import type { CarState } from './car';
import { NO_DAMAGE } from './damage';
import { createGame, stepGame, type GameState, type SimContext } from './game';
import { boxSpot, inLimit, pitLanePlace, pitStep, stopTicks } from './pit';

const track = buildTrack(MONZA, { pitLane: true });
const road = track.routes.find((r) => r.pit)!;
const rules = road.pitRules!;
const ctx: SimContext = {
  track,
  carParams: CAR_PARAMS,
  surfaceParams: SURFACE_PARAMS,
  collisionParams: COLLISION_PARAMS,
  slipstreamParams: SLIPSTREAM_PARAMS,
  damage: DAMAGE_PARAMS,
  pit: { params: P, boxes: { p1: 0 } },
};
const THROTTLE = { ...NEUTRAL_INPUT, throttle: 1 };

/** The pit lane's sample `d` m along its route. */
const laneAt = (d: number) => road.samples.find((s) => s.distance >= d)!;

/** Car p1 on the lane's centreline `d` m along its route, at `speed` along it. */
function onLane(d: number, speed: number, car: Partial<CarState> = {}): GameState {
  const s = laneAt(d);
  const game = createGame(track, ['p1']);
  const heading = headingOf(s.tangent);
  return {
    ...game,
    cars: [
      {
        ...game.cars[0]!,
        position: s.position,
        heading,
        velocity: scale(s.tangent, speed),
        ...car,
      },
    ],
  };
}

function run(state: GameState, ticks: number, input = NEUTRAL_INPUT, context = ctx): GameState {
  for (let i = 0; i < ticks; i++) state = stepGame(state, { p1: input }, context);
  return state;
}

describe('pit lane rules', () => {
  it('know where the lane is, and its limited stretch', () => {
    const middle = (rules.limitFrom + rules.limitTo) / 2;
    expect(inLimit(pitLanePlace(track, laneAt(middle).position))).toBe(true);
    expect(inLimit(pitLanePlace(track, laneAt(rules.limitFrom - 20).position))).toBe(false);
    expect(pitLanePlace(track, track.samples[100]!.position)).toBeNull();
    expect(rules.boxes).toHaveLength(8);
    expect(rules.boxes.every((b) => b > rules.limitFrom && b < rules.limitTo)).toBe(true);
  });

  it('time a stop by the damage: the tyres always, each wing by its damage', () => {
    expect(stopTicks(undefined, P)).toBe(P.tyresTime * TICK_RATE);
    expect(stopTicks({ ...NO_DAMAGE, frontWing: 0.5, rearWing: 1 }, P)).toBe(
      Math.round((P.tyresTime + P.frontWingTime / 2 + P.rearWingTime) * TICK_RATE),
    );
  });
});

describe('stepGame — pit lane (Grand Prix)', () => {
  const middle = (rules.limitFrom + rules.limitTo) / 2;

  it('limits the speed between the limit lines, automatically; not without the pit rules', () => {
    const fast = run(onLane(middle, 40), 2, THROTTLE);
    expect(length(fast.cars[0]!.velocity)).toBeLessThanOrEqual(rules.speedLimit + 1e-9);
    const noPit = (({ pit: _pit, ...rest }: SimContext): SimContext => rest)(ctx);
    const free = run(onLane(middle, 40), 2, THROTTLE, noPit);
    expect(length(free.cars[0]!.velocity)).toBeGreaterThan(rules.speedLimit + 5);
  });

  it('stops a slow car in its own box, holds it, then lets it go repaired', () => {
    const damage = { frontWing: 0.5, rearWing: 0, tyres: [0.3, 0.3, 0, 0] as const };
    let state = run(onLane(rules.boxes[0]! - 3, 5, { damage }), 1);
    const stopped = state.cars[0]!;
    expect(stopped.pitStop).toBeDefined();
    expect(distance(stopped.position, boxSpot(road, 0, P).position)).toBeLessThan(0.01);
    const ticks = stopTicks(damage, P);
    expect(stopped.pitStop!.until).toBe(state.tick + ticks);
    // Held still, whatever the controls (R too), with its damage until the end of the stop.
    state = run(state, ticks - 2, THROTTLE);
    state = stepGame(state, { p1: { ...THROTTLE, reset: true } }, ctx);
    expect(distance(state.cars[0]!.position, stopped.position)).toBeLessThan(0.01);
    expect(state.cars[0]!.damage!.frontWing).toBeGreaterThan(0);
    state = run(state, 1, THROTTLE);
    expect(state.cars[0]!.damage).toEqual(NO_DAMAGE);
    // Released: it drives off, and doesn't stop again on this pass.
    state = run(state, 60, THROTTLE);
    expect(distance(state.cars[0]!.position, stopped.position)).toBeGreaterThan(5);
    expect(state.cars[0]!.pitStop).toBeDefined();
  });

  it("never stops a car that is too fast, at another's box, or without a box", () => {
    expect(run(onLane(rules.boxes[0]! - 3, P.boxSpeed + 3), 1).cars[0]!.pitStop).toBeUndefined();
    expect(run(onLane(rules.boxes[3]!, 3), 1).cars[0]!.pitStop).toBeUndefined();
    const noBox = { ...ctx, pit: { params: P, boxes: {} } };
    expect(
      run(onLane(rules.boxes[0]!, 3), 1, NEUTRAL_INPUT, noBox).cars[0]!.pitStop,
    ).toBeUndefined();
  });

  it('forgets a stop once the car has left the lane', () => {
    const car = { ...createGame(track, ['p1']).cars[0]!, pitStop: { until: 10 } };
    expect(pitStep(car, track, 50, ctx.pit!).pitStop).toBeUndefined();
    const inLane = { ...car, position: laneAt(middle).position };
    expect(pitStep(inLane, track, 50, ctx.pit!).pitStop).toEqual({ until: 10 });
  });
});
