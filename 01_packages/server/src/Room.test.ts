import { describe, expect, it } from 'vitest';
import { distance, dot, findCar, forward, NEUTRAL_INPUT, TEST_TRACK } from '@altf1/shared';
import { Room } from './Room.ts';

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

  it('removes a leaving player and forgets its input', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.add('p2');
    room.setInput('p2', THROTTLE);
    room.remove('p2');
    expect(room.state.cars.map((c) => c.id)).toEqual(['p1']);
    expect(room.state.laps.map((l) => l.carId)).toEqual(['p1']);
    room.add('p2');
    for (let i = 0; i < 30; i++) room.tick();
    expect(findCar(room.state, 'p2')!.velocity).toEqual({ x: 0, z: 0 });
  });

  it('drives each car with its player latest input, others stay neutral', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.add('p2');
    room.setInput('p1', THROTTLE);
    for (let i = 0; i < 60; i++) room.tick();
    const p1 = findCar(room.state, 'p1')!;
    expect(dot(p1.velocity, forward(p1.heading))).toBeGreaterThan(10);
    expect(findCar(room.state, 'p2')!.velocity).toEqual({ x: 0, z: 0 });
  });

  it('applies a reset exactly once, even if another input arrives before the tick', () => {
    const room = new Room(TEST_TRACK);
    room.add('p1');
    room.setInput('p1', THROTTLE);
    for (let i = 0; i < 60; i++) room.tick();
    room.setInput('p1', { ...THROTTLE, reset: true });
    room.setInput('p1', THROTTLE); // the next client tick, before the server ticked
    room.tick();
    expect(findCar(room.state, 'p1')!.velocity).toEqual({ x: 0, z: 0 }); // reset happened
    room.tick();
    const p1 = findCar(room.state, 'p1')!;
    expect(dot(p1.velocity, forward(p1.heading))).toBeGreaterThan(0); // and only once
  });

  it('ignores inputs for unknown players and does not tick while empty', () => {
    const room = new Room(TEST_TRACK);
    room.setInput('ghost', THROTTLE);
    room.tick();
    expect(room.state.tick).toBe(0);
    room.add('p1');
    room.tick();
    expect(room.state.tick).toBe(1);
  });
});
