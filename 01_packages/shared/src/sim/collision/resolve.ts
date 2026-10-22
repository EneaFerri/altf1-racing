import type { CollisionParams } from '../../config/collision';
import type { CarState } from '../car';
import { resolveCarPair } from './cars';
import type { ImpactEvent } from './types';
import { resolveWalls, type WallSet } from './walls';

/**
 * Collision pass, run once per tick after every car has moved. Each solver pass resolves all car
 * pairs (in id order) and then the walls, which go last so no car is ever left inside a wall.
 * Impulses only act on contacts that are closing in, so repeating the pass only cleans up overlaps.
 * Returns the strongest impact per car and per thing it hit.
 */
export function resolveCollisions(
  cars: readonly CarState[],
  walls: WallSet,
  p: CollisionParams,
): { cars: CarState[]; impacts: ImpactEvent[] } {
  const result = [...cars];
  const impacts = new Map<string, ImpactEvent>();
  const record = (impact: ImpactEvent): void => {
    const key = `${impact.carId}|${impact.other}`;
    const previous = impacts.get(key);
    if (!previous || impact.strength > previous.strength) impacts.set(key, impact);
  };

  const passes = Math.max(1, Math.round(p.solverIterations));
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < result.length; i++) {
      for (let k = i + 1; k < result.length; k++) {
        const pair = resolveCarPair(result[i]!, result[k]!, p);
        result[i] = pair.a;
        result[k] = pair.b;
        pair.impacts.forEach(record);
      }
    }
    for (let i = 0; i < result.length; i++) {
      const { car, impact } = resolveWalls(result[i]!, walls, p);
      result[i] = car;
      if (impact) record(impact);
    }
  }
  return { cars: result, impacts: [...impacts.values()] };
}
