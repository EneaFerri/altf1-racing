# Tracks & Surfaces

Everything about the circuit lives in `01_packages/shared/src/track/`; it is static data that both
the simulation (surfaces, reset, grid, later walls and laps) and the View (meshes) read.

## From definition to track

```
TrackDefinition (hand-written)  ──buildTrack()──►  Track (compiled, immutable)
  points, halfWidth,                                samples (every 2 m): position, tangent, normal,
  runoffWidth, highKerbs                            distance, curvature · kerbs & runoff per side ·
                                                    walls (one-sided) · lookup grids
```

- **`TrackDefinition`** (`track/types.ts`): control points of a closed spline in driving order, half the
  asphalt width, the run-off width up to the wall, and ranges of control points that get high kerbs.
- **`buildTrack(def)`** (`track/buildTrack.ts`): samples a closed centripetal Catmull-Rom spline
  (`math/spline.ts`) every `sampleSpacing` m. For each sample it stores:
  - tangent and normal (right);
  - distance from the start line;
  - signed curvature (positive = right turn).

  Then it derives kerbs, run-off, walls and grids. Pure and deterministic.

- **Sample 0 is the start/finish line**, at control point 0. Segment `i` joins sample `i` to `i + 1`.
- The **`Track` is never part of `GameState`**: it is passed in `SimContext`, not cloned per tick
  and not sent over the network (clients will load it by name).

## Automatic rules (`config/track.ts` → `TRACK_RULES`)

| Rule         | Value                       | Effect                                                                              |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| Low kerbs    | curvature > 1/110 m         | Both sides of every real corner (apex + exit), extended 8 m before/after            |
| Gravel traps | curvature > 1/45 m          | Outside of tight corners, from 6 m before to 36 m after (where cars run wide)       |
| High kerbs   | declared in `highKerbs`     | Inside of each curving sample in the range (replaces the low kerb there)            |
| Kerb band    | edge − 0.6 m → edge + 1.0 m | Lateral band where a kerb counts                                                    |
| Walls        | halfWidth + runoffWidth     | One-sided polylines on both sides, `normal` pointing at the track (used in step 4b) |

So a new track only needs a shape; kerbs and gravel follow the corners automatically.

## Queries (`track/query.ts`)

- `locateOnTrack(track, p)`: closest centreline point, segment index, tangent, **signed lateral
  offset** (+ = right) and distance along the lap. Uses the centreline `SegmentGrid` near the track
  and a full scan when far away.
- `surfaceAt(track, p)`: lateral offset → band → surface:
  1. asphalt within `halfWidth − 0.6`;
  2. kerb or high kerb in the kerb band, if that side has one there;
  3. asphalt up to the edge;
  4. beyond the edge, the side's run-off (grass/gravel).
- `gridSlot(track, slot)`: staggered starting grid, 10 m + 8 m per slot behind the line, alternating sides.

`math/SegmentGrid.ts` is a generic uniform grid over segments (10 m cells). Queries return sorted
indices, so results never depend on insertion order (determinism).

## Surfaces (`config/surfaces.ts` → `SURFACE_PARAMS`)

Each car samples the surface under its **four wheels** (`CAR_WHEELS` in `config/car.ts`) at the start
of every tick and **averages** their effects: two wheels on the grass give half the grass penalty.

| Surface      | grip | traction | drag (m/s²) | bumpSpin (rad/s) | Feel                                                        |
| ------------ | ---- | -------- | ----------- | ---------------- | ----------------------------------------------------------- |
| `asphalt`    | 1    | 1        | 0           | 0                | Reference                                                   |
| `kerb` (low) | 0.85 | 0.95     | 0.5         | 0                | Usable: a small cost for a shorter line                     |
| `highKerb`   | 0.45 | 0.7      | 4           | 0.9              | Sausage kerb: kicks the car and ends a drift — don't cut it |
| `grass`      | 0.5  | 0.6      | 5           | 0                | Slow and slippery, recoverable                              |
| `gravel`     | 0.35 | 0.4      | 14          | 0                | Trap: kills speed fast                                      |

- `grip` multiplies lateral grip, `traction` multiplies thrust and braking, `drag` is extra deceleration.
- **`bumpSpin`**: when a wheel _climbs onto_ that surface, the car gets a yaw kick (left wheel →
  nose kicked right, and vice versa), scaled by speed (×1 at 30 m/s, max ×1.5), and can't drift
  that tick. Staying on the kerb doesn't kick again. The kick goes into `CarState.spin` (see physics.md).
- All values are live-tunable in the dev panel (F2 → Surfaces).

## The test track (`track/layouts/testTrack.ts`)

"Test Ring", ~1.43 km, clockwise seen from above, 12 m wide, 10 m run-off. Control points are
sketched at a smaller size and scaled ×1.1.

| Points | Section                                                                                |
| ------ | -------------------------------------------------------------------------------------- |
| 0–2    | Main straight (~440 m), start line at point 0                                          |
| 3–6    | Hairpin, semicircle radius ~30 m: heavy braking, overtaking/drift spot, gravel outside |
| 7–10   | Short run into a fast chicane with **high kerbs** on the inside                        |
| 11–13  | Fast left sweeper onto the back section                                                |
| 14–19  | Long double-apex right: the drift showcase                                             |
| 20–22  | Fast kink, flat out                                                                    |
| 23–24  | Medium 90° right back onto the straight                                                |

Tests (`track/buildTrack.test.ts`) guard the layout: closed loop of ~1.5 km, walls never fold back,
distant sections keep their run-offs apart, kerbs only in corners, high kerbs only in the chicane.

## Making a new track

1. Copy `layouts/testTrack.ts`, change `name` and `points` (driving order, closed loop, no crossings).
2. Keep corner radii above `halfWidth + runoffWidth` (16 m here), or the inner wall folds back
   (the "walls never fold" test catches it).
3. List chicanes or corners that need high kerbs in `highKerbs` (control point index ranges).
4. Export it from `track/index.ts` and run the tests.
