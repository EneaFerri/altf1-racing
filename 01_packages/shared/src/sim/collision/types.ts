import type { Vec2 } from '../../math/vec2';
import type { CarId } from '../car';

/** One car hitting something during a tick. Plain data: the View will turn these into sparks and sounds. */
export interface ImpactEvent {
  readonly carId: CarId;
  /** The other car's id, or 'wall'. */
  readonly other: CarId | 'wall';
  /** Contact point (m). */
  readonly point: Vec2;
  /** Unit vector pushing `carId` away from what it hit. */
  readonly normal: Vec2;
  /** Closing speed along `normal` at the moment of contact (m/s): how hard the hit was. */
  readonly strength: number;
}
