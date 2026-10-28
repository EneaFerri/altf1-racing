import { describe, expect, it } from 'vitest';
import {
  buildTrack,
  createGame,
  distance,
  findCar,
  NEUTRAL_INPUT,
  onlineSimContext,
  stepGame,
  TEST_TRACK,
  type GameState,
  type InputCommand,
} from '@altf1/shared';
import { Predictor, SNAP_DISTANCE, type Snapshot } from './Predictor';

const ctx = onlineSimContext(buildTrack(TEST_TRACK));
const THROTTLE: InputCommand = { ...NEUTRAL_INPUT, throttle: 1 };
const LEFT: InputCommand = { ...THROTTLE, steer: -1 };

function snapshot(
  state: GameState,
  acks: Snapshot['acks'] = {},
  inputs: Snapshot['inputs'] = {},
): Snapshot {
  return { type: 'snapshot', state, acks, inputs };
}

/** `ticks` server ticks from `state`, p1 driving `own(i)`, p2 its fixed `other`. */
function run(
  state: GameState,
  ticks: number,
  own: (i: number) => InputCommand,
  other = NEUTRAL_INPUT,
): GameState {
  for (let i = 0; i < ticks; i++) state = stepGame(state, { p1: own(i), p2: other }, ctx);
  return state;
}

const own = (car: GameState | null) => findCar(car!, 'p1')!;

describe('Predictor', () => {
  it('draws nothing before the first snapshot, but keeps the inputs', () => {
    const predictor = new Predictor('p1', ctx);
    predictor.step(0, THROTTLE);
    expect(predictor.current).toBeNull();
    expect(predictor.ahead).toBe(1);
  });

  it('still predicts the other cars when its own is off the track', () => {
    const start = createGame(ctx.track, ['p2']);
    const predictor = new Predictor('p1', ctx);
    predictor.reconcile(snapshot(start, {}, { p2: THROTTLE }));
    for (let seq = 0; seq < 20; seq++) predictor.step(seq, NEUTRAL_INPUT);
    expect(findCar(predictor.current!, 'p1')).toBeUndefined();
    expect(findCar(predictor.current!, 'p2')).toEqual(
      findCar(
        run(start, 20, () => THROTTLE, THROTTLE),
        'p2',
      ),
    );
  });

  it('holds every car on the grid like the server, until lights out', () => {
    const start = createGame(ctx.track, ['p1', 'p2']);
    const predictor = new Predictor('p1', ctx);
    predictor.hold = { lightsFrom: 0, until: 10 };
    predictor.reconcile(snapshot(start, {}, { p2: THROTTLE }));
    for (let seq = 0; seq < 10; seq++) predictor.step(seq, THROTTLE);
    expect(own(predictor.current).velocity).toEqual(own(start).velocity);
    predictor.step(10, THROTTLE);
    expect(own(predictor.current).velocity).not.toEqual(own(start).velocity);
  });

  it('moves its own car on the very tick the key is pressed', () => {
    const start = createGame(ctx.track, ['p1', 'p2']);
    const predictor = new Predictor('p1', ctx);
    predictor.reconcile(snapshot(start));
    predictor.step(0, THROTTLE);
    expect(own(predictor.current).velocity).not.toEqual({ x: 0, z: 0 });
    expect(own(predictor.before)).toEqual(own(start));
  });

  it('replays the inputs the server has not run: a right prediction is not corrected', () => {
    const start = createGame(ctx.track, ['p1', 'p2']);
    const inputs = (i: number) => (i < 30 ? THROTTLE : LEFT);
    const predictor = new Predictor('p1', ctx);
    predictor.reconcile(snapshot(start));
    for (let seq = 0; seq < 50; seq++) predictor.step(seq, inputs(seq));
    // The server has run inputs 0..39 when its snapshot arrives; the client is 10 ticks ahead.
    predictor.reconcile(snapshot(run(start, 40, inputs), { p1: 39 }, { p2: NEUTRAL_INPUT }));
    expect(predictor.ahead).toBe(10);
    expect(predictor.lastCorrection).toBe(0);
    expect(own(predictor.current)).toEqual(own(run(start, 50, inputs)));
  });

  it('moves the other cars on with their last input, never with its reset', () => {
    const start = createGame(ctx.track, ['p1', 'p2']);
    const predictor = new Predictor('p1', ctx);
    predictor.reconcile(snapshot(start, {}, { p2: { ...THROTTLE, reset: true } }));
    for (let seq = 0; seq < 20; seq++) predictor.step(seq, NEUTRAL_INPUT);
    const expected = run(start, 20, () => NEUTRAL_INPUT, THROTTLE);
    expect(findCar(predictor.current!, 'p2')).toEqual(findCar(expected, 'p2'));
  });

  it('fades a small correction out from where the car was drawn', () => {
    const start = createGame(ctx.track, ['p1', 'p2']);
    const predictor = new Predictor('p1', ctx);
    predictor.reconcile(snapshot(start));
    const drawn = own(predictor.current).position;
    const moved = own(start).position;
    const server = {
      ...start,
      cars: start.cars.map((c) =>
        c.id === 'p1' ? { ...c, position: { ...moved, x: moved.x + 1 } } : c,
      ),
    };
    predictor.reconcile(snapshot(server));
    expect(predictor.lastCorrection).toBeCloseTo(1);
    expect(own(predictor.current).position.x).toBeCloseTo(drawn.x); // no jump on screen
    predictor.decay(0.1);
    const halfway = own(predictor.current).position.x;
    expect(halfway).toBeGreaterThan(drawn.x);
    expect(halfway).toBeLessThan(drawn.x + 1);
    predictor.decay(2);
    expect(own(predictor.current).position.x).toBeCloseTo(drawn.x + 1); // fully corrected
  });

  it('shows a big correction at once', () => {
    const start = createGame(ctx.track, ['p1', 'p2']);
    const predictor = new Predictor('p1', ctx);
    predictor.reconcile(snapshot(start));
    const far = run(start, 120, () => THROTTLE); // ~2 s of driving the client never saw
    predictor.reconcile(snapshot(far));
    expect(distance(own(far).position, own(start).position)).toBeGreaterThan(SNAP_DISTANCE);
    expect(own(predictor.current)).toEqual(own(far));
  });
});
