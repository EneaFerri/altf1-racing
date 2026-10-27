import { describe, expect, it } from 'vitest';
import { distance, dot, findCar, forward, NEUTRAL_INPUT, TEST_TRACK } from '@altf1/shared';
import { MAX_QUEUED_INPUTS, Room } from './Room.ts';

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

  it('repeats the last input while none waits, without moving the ack', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.queueInput('p1', 0, THROTTLE);
    for (let i = 0; i < 60; i++) room.tick();
    const p1 = findCar(room.state, 'p1')!;
    expect(dot(p1.velocity, forward(p1.heading))).toBeGreaterThan(10);
    expect(room.acks).toEqual({ p1: 0 });
  });

  it('ignores duplicate and stale inputs', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.queueInput('p1', 5, NEUTRAL_INPUT);
    room.queueInput('p1', 5, THROTTLE);
    room.queueInput('p1', 3, THROTTLE);
    room.tick();
    room.tick();
    expect(room.acks).toEqual({ p1: 5 });
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 });
    room.queueInput('p1', 4, THROTTLE); // older than the one already run
    room.tick();
    expect(room.acks).toEqual({ p1: 5 });
  });

  it('drops the oldest inputs past the cap, keeping their reset', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.queueInput('p1', 0, THROTTLE);
    for (let i = 0; i < 60; i++) room.tick();
    room.queueInput('p1', 1, { ...THROTTLE, reset: true });
    for (let seq = 2; seq <= MAX_QUEUED_INPUTS + 1; seq++) room.queueInput('p1', seq, THROTTLE);
    room.tick();
    expect(room.acks).toEqual({ p1: 2 }); // seq 1 dropped...
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 }); // ...but its reset ran
  });

  it('applies a reset exactly once, never when repeating the last input', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.queueInput('p1', 0, THROTTLE);
    for (let i = 0; i < 60; i++) room.tick();
    room.queueInput('p1', 1, { ...THROTTLE, reset: true });
    room.tick();
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 }); // reset happened
    room.tick(); // nothing queued: throttle repeated, reset not
    const p1 = findCar(room.state, 'p1')!;
    expect(dot(p1.velocity, forward(p1.heading))).toBeGreaterThan(0);
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
});
