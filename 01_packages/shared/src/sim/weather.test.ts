import { describe, expect, it } from 'vitest';
import { BOT_PARAMS } from '../config/bot';
import { CAR_PARAMS } from '../config/car';
import { COLLISION_PARAMS } from '../config/collision';
import { FIXED_DT, TICK_RATE } from '../config/sim';
import { SLIPSTREAM_PARAMS } from '../config/slipstream';
import { SURFACE_PARAMS } from '../config/surfaces';
import { WET_PARAMS } from '../config/weather';
import { botInput, NEW_BOT_MEMORY } from '../ai/driver';
import { botCarParams, buildBotPlan } from '../ai/plan';
import { add, dot, forward, right, scale } from '../math/vec2';
import { NEUTRAL_INPUT } from '../types/input';
import { createCar, stepCar, type CarState } from './car';
import { createGame, findCar, findLap, stepGame, type SimContext } from './game';
import { NEUTRAL_SURFACE_EFFECT } from './surface';
import { buildTrack } from '../track/buildTrack';
import { SAO_PAULO } from '../track/layouts/saoPaulo';
import { TEST_TRACK } from '../track/layouts/testTrack';
import { GRID_SLOTS, gridSlot, locateOnTrack, surfaceAt } from '../track/query';
import { inPuddle, placePuddles, puddleShare, wetSurfaceEffect } from './weather';

const saoPaulo = buildTrack(SAO_PAULO);
const puddles = placePuddles(saoPaulo);

describe('placePuddles', () => {
  it('places the same puddles every time, with or without the pit lane', () => {
    expect(placePuddles(saoPaulo)).toEqual(puddles);
    expect(placePuddles(buildTrack(SAO_PAULO, { pitLane: true }))).toEqual(puddles);
  });

  it('places a few dozen on São Paulo, more of them round the corners', () => {
    expect(puddles.length).toBeGreaterThanOrEqual(15);
    expect(puddles.length).toBeLessThanOrEqual(60);
    const bendy = puddles.filter((p) => {
      const s = saoPaulo.samples[locateOnTrack(saoPaulo, p.center).index]!;
      return Math.abs(s.curvature) > 1 / 200;
    });
    expect(bendy.length).toBeGreaterThan(puddles.length / 3);
  });

  it('places a different set on another track', () => {
    expect(placePuddles(buildTrack(TEST_TRACK))).not.toEqual(puddles);
  });

  it('keeps every puddle wholly on the asphalt', () => {
    for (const p of puddles) {
      for (const [a, b] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [0.7, 0.7],
        [-0.7, -0.7],
      ] as const) {
        const edge = add(
          p.center,
          add(scale(p.axis, a * p.halfLength), scale(p.normal, b * p.halfWidth)),
        );
        expect(surfaceAt(saoPaulo, edge)).toBe('asphalt');
      }
    }
  });

  it('keeps the starting grid dry', () => {
    for (let slot = 0; slot < GRID_SLOTS; slot++) {
      expect(inPuddle(gridSlot(saoPaulo, slot).position, puddles)).toBe(false);
    }
  });
});

describe('inPuddle', () => {
  const p = puddles[0]!;

  it('is true at the centre and just inside the ends, false just outside', () => {
    expect(inPuddle(p.center, puddles)).toBe(true);
    expect(inPuddle(add(p.center, scale(p.axis, p.halfLength * 0.95)), [p])).toBe(true);
    expect(inPuddle(add(p.center, scale(p.axis, p.halfLength * 1.05)), [p])).toBe(false);
    expect(inPuddle(add(p.center, scale(p.normal, p.halfWidth * 1.05)), [p])).toBe(false);
  });

  it('is false with no puddles', () => {
    expect(inPuddle(p.center, [])).toBe(false);
  });
});

describe('wetSurfaceEffect', () => {
  it('takes a little grip, traction and braking everywhere', () => {
    const wet = wetSurfaceEffect(NEUTRAL_SURFACE_EFFECT, 0, WET_PARAMS);
    expect(wet.grip).toBeCloseTo(WET_PARAMS.grip);
    expect(wet.traction).toBeCloseTo(WET_PARAMS.traction);
    expect(wet.brake).toBeCloseTo(WET_PARAMS.brake);
    expect(wet.drag).toBe(0);
  });

  it('takes more in a puddle, in step with the wheels in it', () => {
    const half = wetSurfaceEffect(NEUTRAL_SURFACE_EFFECT, 0.5, WET_PARAMS);
    const full = wetSurfaceEffect(NEUTRAL_SURFACE_EFFECT, 1, WET_PARAMS);
    expect(full.grip).toBeCloseTo(WET_PARAMS.grip * WET_PARAMS.puddleGrip);
    expect(full.drag).toBeCloseTo(WET_PARAMS.puddleDrag);
    expect(half.grip).toBeCloseTo((WET_PARAMS.grip * (1 + WET_PARAMS.puddleGrip)) / 2);
    expect(half.drag).toBeCloseTo(WET_PARAMS.puddleDrag / 2);
  });

  it('makes a wet surface worse than the same surface dry', () => {
    const grass = { ...NEUTRAL_SURFACE_EFFECT, grip: SURFACE_PARAMS.grass.grip };
    expect(wetSurfaceEffect(grass, 0, WET_PARAMS).grip).toBeLessThan(grass.grip);
  });
});

describe('puddleShare', () => {
  const p = puddles[0]!;
  const heading = Math.atan2(-p.axis.x, -p.axis.z); // forward(heading) = the puddle's axis

  it('counts the wheels in a puddle', () => {
    const over = { ...createCar({ position: p.center, heading }) };
    expect(dot(forward(heading), p.axis)).toBeCloseTo(1);
    expect(puddleShare(over, puddles)).toBeGreaterThan(0);
    const away = createCar({ position: gridSlot(saoPaulo, 0).position });
    expect(puddleShare(away, puddles)).toBe(0);
  });
});

/** Metres from 300 to 80 km/h with the brake held, on asphalt (wet or dry). */
function brakingDistance(wet: boolean): number {
  const effect = wet
    ? wetSurfaceEffect(NEUTRAL_SURFACE_EFFECT, 0, WET_PARAMS)
    : NEUTRAL_SURFACE_EFFECT;
  let car: CarState = { ...createCar(), velocity: scale(forward(0), 300 / 3.6) };
  const brake = { ...NEUTRAL_INPUT, brake: 1 };
  let metres = 0;
  while (dot(car.velocity, forward(car.heading)) > 80 / 3.6) {
    car = stepCar(car, brake, CAR_PARAMS, FIXED_DT, effect);
    metres += dot(car.velocity, forward(car.heading)) * FIXED_DT;
  }
  return metres;
}

/**
 * Slip (sideways speed over forward speed) after 1 s of full steering from 180 km/h, off the
 * throttle, on asphalt (wet or dry): how wide the car slides.
 */
function slide(wet: boolean): number {
  const effect = wet
    ? wetSurfaceEffect(NEUTRAL_SURFACE_EFFECT, 0, WET_PARAMS)
    : NEUTRAL_SURFACE_EFFECT;
  let car: CarState = { ...createCar(), velocity: scale(forward(0), 50) };
  const turn = { ...NEUTRAL_INPUT, steer: 1 };
  for (let tick = 0; tick < TICK_RATE; tick++) {
    car = stepCar(car, turn, CAR_PARAMS, FIXED_DT, effect);
  }
  return Math.abs(dot(car.velocity, right(car.heading)) / dot(car.velocity, forward(car.heading)));
}

describe('a wet track', () => {
  it('brakes much longer: 300 → 80 km/h 50–70% further', () => {
    const ratio = brakingDistance(true) / brakingDistance(false);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(1.7);
  });

  it('slides wider in a corner', () => {
    expect(slide(true)).toBeGreaterThan(slide(false) * 1.5);
    expect(slide(true)).toBeLessThan(slide(false) * 5);
  });

  it('lets the Hard bot lap São Paulo without a wall, 15–35% slower than dry', () => {
    const lap = (wet: boolean) => {
      const ctx: SimContext = {
        track: saoPaulo,
        carParams: CAR_PARAMS,
        carParamsById: { bot: botCarParams(CAR_PARAMS, BOT_PARAMS.hard) },
        surfaceParams: SURFACE_PARAMS,
        collisionParams: COLLISION_PARAMS,
        slipstreamParams: SLIPSTREAM_PARAMS,
        ...(wet && { weather: { params: WET_PARAMS, puddles } }),
      };
      const plan = buildBotPlan(
        saoPaulo,
        CAR_PARAMS,
        BOT_PARAMS.hard,
        undefined,
        wet ? WET_PARAMS : undefined,
      );
      let state = createGame(saoPaulo, ['bot']);
      let memory = NEW_BOT_MEMORY;
      let walls = 0;
      for (let tick = 0; tick < 160 * TICK_RATE; tick++) {
        const result = botInput(findCar(state, 'bot')!, plan, memory);
        memory = result.memory;
        expect(result.input.reset).toBe(false);
        state = stepGame(state, { bot: result.input }, ctx);
        walls += state.impacts.filter((i) => i.carId === 'bot' && i.other === 'wall').length;
      }
      expect(walls).toBe(0);
      return findLap(state, 'bot')!.bestLap!.ticks / TICK_RATE;
    };
    const ratio = lap(true) / lap(false);
    expect(ratio).toBeGreaterThan(1.15);
    expect(ratio).toBeLessThan(1.35);
  });
});
