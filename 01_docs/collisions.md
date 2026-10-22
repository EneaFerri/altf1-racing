# Collisions

Walls and car-vs-car contacts, in `01_packages/shared/src/sim/collision/`, parameters in
`01_packages/shared/src/config/collision.ts`. Pure and deterministic, run once per tick by `stepGame`
after every car has moved.

**Goal: a crash must not wreck the car.** You hit, lose a little, recover and keep racing. So:

- Collisions change only `position`, `velocity` and `spin` (plus ending a drift on a hard hit). Steering,
  grip and drift run unchanged on the next tick.
- Speed loss grows with the impact angle: a scrape is almost free, a head-on hit stops you.
- Rotation from impacts is bounded and doesn't stack, so there are no spin-outs.
- Walls nudge the nose parallel to them, so you never end up stuck with the nose in the tyres.

## Shape — `collider.ts`

Each car is **3 circles** on its centre axis (`CAR_COLLIDER`: radius 1.1 m, centres 1.7 / 0 / −1.3 m
ahead of the car's position). Together they cover the ~5.6 × 2.4 m body including wheels and wings.
Circles make every test a distance check: cheap, robust and deterministic.

`applyHit` is the only way a hit changes a car. `kickSpin` adds a spin kick with two rules:

- **Kicks don't stack.** A kick in the direction the car already spins only raises the spin to the
  kick's size. Contacts on consecutive ticks can't wind a car up.
- A kick in the opposite direction adds (it slows the rotation). The result is clamped to ±max, but a
  bigger spin from a high kerb is kept.

## Solver — `resolve.ts`

`resolveCollisions(cars, walls, params)` runs `solverIterations` passes (default 3). Each pass handles
**all car pairs** first (in id order), then **the walls**. Walls go last, so a car pushed by another car
still never ends up inside a wall. A velocity response only fires while a contact is closing in, so the
extra passes just clean up the overlaps left when one car touches several things at once.

The result includes `impacts`: one `ImpactEvent { carId, other, point, normal, strength }` per car and
per thing it hit (the strongest one), where `strength` is the closing speed in m/s.
`stepGame` stores them in `GameState.impacts` for that tick only. The View will turn them into sparks
and sounds later; for now the F3 overlay shows the last one.

## Walls — `walls.ts`

- **One-sided** (`WallSegment.normal` points at the track). A circle is pushed out along the normal.
  Past the end of a segment, it is pushed radially away from the polyline corner.
- **Anti-tunnelling**: a circle up to `WALL_CATCH_DEPTH` (2 m) behind a wall is still pushed back to the
  track side. At 250 km/h a car moves 1.2 m per tick, so it can never slip through.
- **Response** (only while moving into the wall), with `vn` = speed into the wall:
  1. bounce: `vn' = wallRestitution · vn` (tiny, no pinball);
  2. Coulomb friction along the wall: loses `wallFriction · (1 + e) · vn`. A shallow scrape has a small
     `vn` and costs almost nothing;
  3. **alignment spin** (arcade assist): kick = `wallAlignSpin · (angle between the nose and the wall)`,
     capped at `maxAlignSpin`, turning the nose along the wall in the direction of travel. A value about
     equal to `spinDamping` lines the car up exactly. It is skipped above ~70° (head-on: you reverse
     out), when reversing, and below 3 m/s along the wall.

## Car vs car — `cars.ts` ("F1 arcade")

- The contact is the deepest overlap of the 3 × 3 circle pairs. Equal masses: each car moves out by
  half the overlap.
- Normal impulse with `carRestitution`. **Momentum is conserved**: in a rear-end hit the car in front
  gets a push and the car behind loses about the same amount of speed.
- Low friction (`carFriction`), so side-by-side rubbing slides instead of sticking.
- **Lever spin** from an off-centre hit: `−cross(r, J) / inertia · carSpinScale`, capped at
  `maxImpactSpin`. It fades in between `carSpinMinImpact` and twice that value, so pushing or leaning on
  a car never rotates it. Only a real hit does.

## Drift and impacts

A hit with `strength > driftBreakImpactSpeed` ends a drift and sets `gripRecovery = 0`. That is the
normal drift exit: the car slides out and straightens without losing speed, and it can drift again
straight away if the handbrake is still held. A gentle scrape keeps the drift going. If a hit pushed
the slip angle past the drift's maximum, `stepDrift` eases it back instead of snapping the nose
(see [physics.md](physics.md#drift-mode--easy-arcade-style)).

## Parameters

| Param                   | Value | Unit  | Higher means…                                                   |
| ----------------------- | ----- | ----- | --------------------------------------------------------------- |
| `wallRestitution`       | 0.1   | —     | Bouncier walls                                                  |
| `wallFriction`          | 0.12  | —     | Wall scrapes cost more speed                                    |
| `wallAlignSpin`         | 5     | 1/s   | Nose turns parallel to the wall faster (above ~4 it overshoots) |
| `maxAlignSpin`          | 3     | rad/s | Steeper hits can still be lined up                              |
| `carRestitution`        | 0.3   | —     | Bouncier car-vs-car hits                                        |
| `carFriction`           | 0.1   | —     | Rubbing costs more speed, cars "grab" each other                |
| `carSpinScale`          | 0.5   | —     | Off-centre hits rotate cars more                                |
| `carSpinMinImpact`      | 3     | m/s   | Harder hits needed before a car rotates                         |
| `maxImpactSpin`         | 1.2   | rad/s | Bigger nudge from a car hit (heading change ≈ spin / damping)   |
| `driftBreakImpactSpeed` | 6     | m/s   | Drifts survive harder hits                                      |
| `solverIterations`      | 3     | —     | Cleaner separation in multi-contact pile-ups                    |

All of these are live in the dev tuning panel (F2 → Collisions).

## Measured behaviour (values above, full throttle, no steering)

| Situation                                         | Result                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| Wall at 200 km/h, 10° / 20° / 30° / 45° / 60°     | keeps 95% / 85% / 71% / 46% / 22% of its speed (minimum) |
| Wall, 10° at 200 km/h                             | parallel to the wall again within ~0.5 s                 |
| Wall, head-on at 100 km/h                         | stops, bounces back < 3 m/s; reversing gets it out       |
| Rear-end hit at 10 m/s closing speed              | behind −6.5 m/s, in front +6.5 m/s, no rotation          |
| Rear-corner hit / T-bone                          | heading change ≤ ~16° (the spin cap)                     |
| Dive-bomb, cars tangled for 1.5 s and no steering | heading change < 30° for both                            |
| Side-by-side rubbing for 1 s                      | < 5% speed lost                                          |

These are covered by tests in `sim/collision/*.test.ts` and `sim/game.test.ts`. The tests also check that
a car flat out into the barriers of the real track never leaves the walls, and that the solver is
deterministic.
