import { describe, expect, it } from 'vitest';
import {
  buildTrack,
  distance,
  dot,
  findCar,
  forward,
  gridSlot,
  HELD,
  NEUTRAL_INPUT,
  TEST_TRACK,
} from '@altf1/shared';
import { NetSim } from './netSim.ts';
import { MAX_DELAY_TICKS, Room, SHRINK_LEAD } from './Room.ts';

const THROTTLE = { ...NEUTRAL_INPUT, throttle: 1 };

describe('Room', () => {
  it('runs its track and spawns each player on its own grid slot', () => {
    const room = new Room(TEST_TRACK);
    expect(room.definition).toBe(TEST_TRACK);
    room.add('p1');
    room.add('p2');
    const [a, b] = room.state.cars;
    expect(room.state.cars.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(distance(a!.position, b!.position)).toBeGreaterThan(5);
  });

  it('removes a leaving player and forgets its inputs', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.add('p2');
    room.queueInput('p2', 0, THROTTLE);
    room.remove('p2');
    expect(room.state.cars.map((c) => c.id)).toEqual(['p1']);
    expect(room.state.laps.map((l) => l.carId)).toEqual(['p1']);
    room.add('p2');
    for (let i = 0; i < 30; i++) room.tick();
    expect(findCar(room.state, 'p2')!.velocity).toEqual({ x: 0, z: 0 });
    expect(room.acks).toEqual({});
  });

  it('runs one queued input per tick and acks its seq', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.add('p2');
    room.queueInput('p1', 0, THROTTLE);
    room.queueInput('p1', 1, NEUTRAL_INPUT);
    room.tick();
    expect(room.acks).toEqual({ p1: 0 });
    const afterThrottle = findCar(room.state, 'p1')!;
    expect(dot(afterThrottle.velocity, forward(afterThrottle.heading))).toBeGreaterThan(0);
    room.tick();
    expect(room.acks).toEqual({ p1: 1 });
    expect(findCar(room.state, 'p2')!.velocity).toEqual({ x: 0, z: 0 }); // no input: neutral
  });

  it('repeats the last input for a slot whose input has not arrived, and uses the slot up', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.queueInput('p1', 0, THROTTLE);
    for (let i = 0; i < 10; i++) room.tick();
    const p1 = findCar(room.state, 'p1')!;
    expect(dot(p1.velocity, forward(p1.heading))).toBeGreaterThan(1);
    expect(room.acks).toEqual({ p1: 9 });
    expect(room.lastInputs).toEqual({ p1: THROTTLE });
  });

  it('ignores duplicate inputs and throws late ones away', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.queueInput('p1', 5, NEUTRAL_INPUT);
    room.queueInput('p1', 5, THROTTLE); // duplicate
    room.queueInput('p1', 3, THROTTLE); // before the first slot
    room.tick();
    room.tick();
    expect(room.acks).toEqual({ p1: 6 });
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 });
    room.queueInput('p1', 6, THROTTLE); // its slot already ran
    room.tick();
    expect(room.acks).toEqual({ p1: 7 });
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 });
  });

  it('applies the reset of a late input with the next input run', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.queueInput('p1', 0, THROTTLE);
    for (let i = 0; i < 60; i++) room.tick();
    room.queueInput('p1', 1, { ...THROTTLE, reset: true }); // late
    room.tick();
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 });
  });

  it('applies a reset exactly once, never when repeating the last input', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    for (let seq = 0; seq < 60; seq++) {
      room.queueInput('p1', seq, THROTTLE);
      room.tick();
    }
    room.queueInput('p1', 60, { ...THROTTLE, reset: true });
    room.tick();
    expect(room.acks).toEqual({ p1: 60 });
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 }); // reset happened
    room.tick(); // nothing arrived: throttle repeated, reset not
    const p1 = findCar(room.state, 'p1')!;
    expect(dot(p1.velocity, forward(p1.heading))).toBeGreaterThan(0);
  });

  it('keeps one slot per tick on a bad network: the prediction never jumps by more than a tick', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    const link = new NetSim(
      { delayMs: 80, jitterMs: 60, stallMs: 300, stallEveryMs: 2000 },
      seeded(7),
    );
    const steer = (seq: number): number => ((seq % 100) - 50) / 50;
    const inFlight: { at: number; seq: number }[] = [];
    let offset: number | null = null;
    let biggestJump = 0;
    let onTime = 0;
    const ticks = 60 * 30;
    for (let seq = 0; seq < ticks; seq++) {
      const now = (seq * 1000) / 60;
      inFlight.push({ at: link.deliveryTime(now), seq });
      while (inFlight[0] && inFlight[0].at <= now) {
        const { seq: s } = inFlight.shift()!;
        room.queueInput('p1', s, { ...THROTTLE, steer: steer(s) });
      }
      room.tick();
      const ack = room.acks['p1'];
      if (ack === undefined) continue;
      // The client's prediction runs (server tick + inputs past the ack): a jump in this offset
      // is a jump of the own car on screen, of one tick of motion per unit.
      const next = room.state.tick - ack;
      if (offset !== null) biggestJump = Math.max(biggestJump, Math.abs(next - offset));
      offset = next;
      if (room.lastInputs['p1']!.steer === steer(ack)) onTime++;
    }
    expect(biggestJump).toBeLessThanOrEqual(1);
    expect(offset! - 1).toBeLessThanOrEqual(MAX_DELAY_TICKS);
    expect(onTime / ticks).toBeGreaterThan(0.85); // the rest: slots of a stall
  });

  it('shrinks a buffer longer than needed one tick at a time', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    const ahead = 12;
    for (let seq = 0; seq < ahead; seq++) room.queueInput('p1', seq, THROTTLE);
    let lead = ahead; // inputs waiting, incl. the one due
    for (let seq = ahead; seq < ahead + 60 * 20; seq++) {
      room.queueInput('p1', seq, THROTTLE);
      const next = seq - (room.acks['p1'] ?? -1);
      expect(lead - next).toBeLessThanOrEqual(1);
      lead = next;
      room.tick();
    }
    expect(lead).toBe(SHRINK_LEAD - 1);
  });

  it('follows the client again after its clock jumped (a tab that stopped ticking)', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    for (let seq = 0; seq < 60; seq++) {
      room.queueInput('p1', seq, THROTTLE);
      room.tick();
    }
    for (let i = 0; i < 120; i++) room.tick(); // 2 s without inputs: slots run on
    for (let seq = 60; seq < 180; seq++) {
      room.queueInput('p1', seq, { ...THROTTLE, steer: 0.5 });
      room.tick();
    }
    expect(room.acks['p1']).toBeGreaterThan(170);
    expect(room.lastInputs['p1']!.steer).toBe(0.5);
  });

  it('ignores inputs for unknown players and does not tick while empty', () => {
    const room = new Room(TEST_TRACK);
    room.queueInput('ghost', 0, THROTTLE);
    room.tick();
    expect(room.state.tick).toBe(0);
    room.add('p1');
    room.tick();
    expect(room.state.tick).toBe(1);
  });

  it('restarts on the grid in a given order, keeping the clock and the players', () => {
    const room = new Room(TEST_TRACK);
    for (const id of ['p1', 'p2', 'p3']) room.add(id);
    for (let i = 0; i < 10; i++) room.tick();
    room.retire('p2');
    room.restart(['p3', 'p2']);
    const track = buildTrack(TEST_TRACK);
    expect(room.state.tick).toBe(10);
    expect(room.state.cars.map((c) => c.id)).toEqual(['p2', 'p3']);
    expect(findCar(room.state, 'p3')!.position).toEqual(gridSlot(track, 0).position);
    expect(findCar(room.state, 'p2')!.position).toEqual(gridSlot(track, 1).position);
    expect(room.has('p1')).toBe(false);
    expect(room.isEmpty).toBe(false);
  });

  it('keeps acking a retired car’s player, and is empty only with no players', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.retire('p1');
    room.queueInput('p1', 0, THROTTLE);
    room.tick();
    expect(room.state.cars).toEqual([]);
    expect(room.acks).toEqual({ p1: 0 });
    expect(room.isEmpty).toBe(false);
    room.remove('p1');
    expect(room.isEmpty).toBe(true);
  });

  it('spawns a retired player’s car back on a free grid slot, keeping their inputs', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.add('p2');
    room.retire('p2');
    room.queueInput('p2', 0, NEUTRAL_INPUT);
    room.spawn('p2');
    room.tick();
    const track = buildTrack(TEST_TRACK);
    expect(findCar(room.state, 'p2')!.position).toEqual(gridSlot(track, 1).position);
    expect(room.acks).toEqual({ p2: 0 });
  });

  it('holds every car still while a start hold lasts', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.hold = HELD;
    room.queueInput('p1', 0, THROTTLE);
    for (let i = 0; i < 30; i++) room.tick();
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 });
    room.hold = { lightsFrom: 0, until: room.state.tick + 10 };
    for (let i = 0; i < 30; i++) room.tick();
    expect(
      dot(findCar(room.state, 'p1')!.velocity, forward(findCar(room.state, 'p1')!.heading)),
    ).toBeGreaterThan(1);
  });

  it('gives the cars damage only while it is on; turning it off repairs them', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.tick();
    expect(room.damage).toBe(false);
    expect(room.state.cars[0]!.damage).toBeUndefined();
    room.setDamage(true);
    room.queueInput('p1', 0, THROTTLE);
    room.tick();
    expect(room.state.cars[0]!.damage).toEqual({ frontWing: 0, rearWing: 0, tyres: [0, 0, 0, 0] });
    room.setDamage(false);
    expect(room.state.cars[0]!.damage).toBeUndefined();
  });
});

/** A repeatable random sequence (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
