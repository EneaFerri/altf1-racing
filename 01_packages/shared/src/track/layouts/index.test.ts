import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../../net/protocol';
import { buildTrack } from '../buildTrack';
import type { WallSegment } from '../types';
import { GP_TRACKS, KRUNCAR, SAO_PAULO, TEST_TRACK } from '.';

function wallDistance(p: { x: number; z: number }, wall: WallSegment): number {
  const dx = wall.b.x - wall.a.x;
  const dz = wall.b.z - wall.a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - wall.a.x) * dx + (p.z - wall.a.z) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(p.x - (wall.a.x + dx * t), p.z - (wall.a.z + dz * t));
}

describe.each(GP_TRACKS.map((d) => [d.name, d] as const))('pit lane of %s', (_name, definition) => {
  const lane = definition.pitLane!;
  const track = buildTrack(definition);

  it('leaves and rejoins the main loop at two of its points, with a road between', () => {
    expect(lane).toBeDefined();
    const n = definition.points.length;
    expect(lane.fromPoint).toBeGreaterThanOrEqual(0);
    expect(lane.toPoint).toBeLessThan(n);
    expect(lane.points.length).toBeGreaterThanOrEqual(10);
    expect(new Set(lane.points.map((p) => p.width)).size).toBe(1);
    expect(lane.points.every((p) => (p.height !== undefined) === track.elevated)).toBe(true);
  });

  /** Metres along the lane of each of its points (from where it leaves the main loop). */
  const along = lane.points.reduce<number[]>((acc, p, i) => {
    const prev = i === 0 ? definition.points[lane.fromPoint]!.at : lane.points[i - 1]!.at;
    return [...acc, (acc[i - 1] ?? 0) + Math.hypot(p.at.x - prev.x, p.at.z - prev.z)];
  }, []);

  it('limits the speed between its entry and exit, with every box in that stretch, in order', () => {
    expect(lane.limit.from).toBeGreaterThan(0);
    expect(lane.limit.to).toBeGreaterThan(lane.limit.from);
    expect(lane.limit.to).toBeLessThan(along.at(-1)!);
    expect(lane.boxes).toHaveLength(MAX_PLAYERS);
    expect(lane.boxes).toEqual([...lane.boxes].sort((a, b) => a - b));
    for (const box of lane.boxes) {
      expect(box).toBeGreaterThanOrEqual(lane.limit.from);
      expect(box).toBeLessThanOrEqual(lane.limit.to);
    }
    // 80 km/h (Monaco 60), scaled like the circuit.
    expect(lane.speedLimit).toBeGreaterThan(15);
    expect(lane.speedLimit).toBeLessThan(25);
  });

  it('runs behind a pit wall between its limit lines, clear of every wall', () => {
    const half = lane.points[0]!.width / 2;
    const between = lane.points.filter(
      (_, i) => along[i]! > lane.limit.from && along[i]! < lane.limit.to,
    );
    expect(between.length).toBeGreaterThanOrEqual(5);
    for (const { at: p } of between) {
      const nearest = Math.min(...track.walls.map((wall) => wallDistance(p, wall)));
      expect(nearest - half).toBeGreaterThan(0.9);
    }
  });
});

describe('pit lanes', () => {
  it('only the real circuits have one', () => {
    expect(TEST_TRACK.pitLane).toBeUndefined();
    expect(KRUNCAR.pitLane).toBeUndefined();
  });
});

describe("São Paulo's pit lane (owner, 2026-11-18)", () => {
  const lane = SAO_PAULO.pitLane!;
  const road = buildTrack(SAO_PAULO, { pitLane: true }).routes.find((r) => r.pit)!;

  it('climbs and falls gently: never steeper than 6%, no step', () => {
    const { samples } = road;
    for (let i = 1; i < samples.length; i++) {
      const [a, b] = [samples[i - 1]!, samples[i]!];
      if (a.distance < road.branch!.from || b.distance > road.branch!.to) continue;
      expect(Math.abs(b.height - a.height) / (b.distance - a.distance)).toBeLessThan(0.06);
    }
  });

  it('has its boxes close together (20 m apart) and a short limiter round them', () => {
    lane.boxes.slice(1).forEach((box, i) => expect(box - lane.boxes[i]!).toBeCloseTo(20));
    expect(lane.limit.to - lane.limit.from).toBeLessThan(300);
    expect(lane.boxes[0]! - lane.limit.from).toBeCloseTo(50);
    expect(lane.limit.to - lane.boxes.at(-1)!).toBeCloseTo(50);
  });
});
