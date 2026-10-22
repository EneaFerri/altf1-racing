/**
 * Collision response parameters. Meaning and measured effect of each value are documented in
 * 01_docs/collisions.md. Starting values, tuned in Phase 1 step 7.
 */
export interface CollisionParams {
  /** Fraction of the speed into a wall that bounces back (0 = dead stop, 1 = elastic). */
  wallRestitution: number;
  /** Speed lost along the wall per unit of impact (Coulomb). Higher = scrapes cost more. */
  wallFriction: number;
  /**
   * Spin (rad/s) per radian between the nose and the wall, turning the car parallel to it (1/s).
   * About `spinDamping` lines the car up exactly; higher overshoots away from the wall.
   */
  wallAlignSpin: number;
  /** Cap on that alignment spin (rad/s). */
  maxAlignSpin: number;
  /** Bounciness of car-vs-car contacts. */
  carRestitution: number;
  /** Friction between two cars in contact. Low = side-by-side rubbing slides instead of sticking. */
  carFriction: number;
  /** Scales the spin an off-centre hit gives a car (0 = never rotates, 1 = rigid body). */
  carSpinScale: number;
  /**
   * Hits slower than this (m/s) give no spin, full spin from twice this. Leaning on or pushing
   * another car never rotates it; only a real hit does.
   */
  carSpinMinImpact: number;
  /** Car-vs-car hits never push `spin` beyond this (rad/s), so a hit is a nudge, never a spin-out. */
  maxImpactSpin: number;
  /** Impact speed (m/s, into the wall or the other car) above which a drift ends. */
  driftBreakImpactSpeed: number;
  /** Solver passes per tick; more = cleaner separation when several contacts touch one car. */
  solverIterations: number;
}

export const COLLISION_PARAMS: CollisionParams = {
  wallRestitution: 0.1,
  wallFriction: 0.12,
  wallAlignSpin: 5,
  maxAlignSpin: 3,
  carRestitution: 0.3,
  carFriction: 0.1,
  carSpinScale: 0.5,
  carSpinMinImpact: 3,
  maxImpactSpin: 1.2,
  driftBreakImpactSpeed: 6,
  solverIterations: 3,
};

/**
 * Car collision shape in its local frame: circles along the centre axis (`ahead` along forward),
 * all with the same radius. Covers the ~5.6 × 2.4 m body including wheels and wings.
 */
export const CAR_COLLIDER = {
  radius: 1.1,
  circles: [1.7, 0, -1.3],
  /** Rotational inertia per unit mass (m²) of the body, ≈ (length² + width²) / 12. */
  inertia: 2.9,
} as const;

/** A circle up to this far behind a wall (m) is still pushed back in front of it (anti-tunnelling). */
export const WALL_CATCH_DEPTH = 2;
