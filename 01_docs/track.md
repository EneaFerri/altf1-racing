# Tracks & Surfaces

Everything about the circuit lives in `01_packages/shared/src/track/`; it is static data that both
the simulation (surfaces, reset, grid, walls, lap timing) and the View (meshes) read.

## From definition to track

```
TrackDefinition (hand-written)  ──buildTrack()──►  Track (compiled, immutable)
  points { at, width },                             samples (every 2 m): position, tangent, normal,
  runoffWidth, highKerbs                            distance, curvature, halfWidth · kerbs & runoff
                                                    per side · walls (one-sided) · lookup grids
```

- **`TrackDefinition`** (`track/types.ts`): control points of a closed spline in driving order, each
  with its **full asphalt width** (`TrackPoint { at, width }`); the run-off width up to the wall; and
  ranges of control points that get high kerbs.
- **`buildTrack(def)`** (`track/buildTrack.ts`): samples a closed centripetal Catmull-Rom spline
  (`math/spline.ts`) every `sampleSpacing` m. For each sample it stores:
  - tangent and normal (right);
  - distance from the start line;
  - signed curvature (positive = right turn);
  - **half-width**, blended between control points with a cosine ease (`sampleClosedSpline` also
    returns each sample's spline parameter, e.g. 3.42 = 42% from point 3 to 4).

  Then it derives kerbs, run-off, walls and grids. Pure and deterministic.

- **Width is variable but never below `TRACK_RULES.minWidth` (24 m)**, twice the original 12 m:
  `buildTrack` throws on a narrower control point, so the rule can't be broken by accident.

- **Sample 0 is the start/finish line**, at control point 0. Segment `i` joins sample `i` to `i + 1`.
- The **`Track` is never part of `GameState`**: it is passed in `SimContext`, not cloned per tick
  and not sent over the network (clients will load it by name).

## Automatic rules (`config/track.ts` → `TRACK_RULES`)

| Rule         | Value                         | Effect                                                                                                 |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| Low kerbs    | curvature > 1/110 m           | Both sides of every real corner (apex + exit), extended 8 m before/after                               |
| Gravel traps | curvature > 1/45 m            | Outside of tight corners, from 6 m before to 36 m after (where cars run wide)                          |
| High kerbs   | declared in `highKerbs`       | Inside of each curving sample in the range (replaces the low kerb there)                               |
| Kerb band    | edge − 0.6 m → edge + 1.0 m   | Lateral band where a kerb counts                                                                       |
| Walls        | local halfWidth + runoffWidth | One-sided polylines on both sides, `normal` pointing at the track (see [collisions.md](collisions.md)) |
| Min width    | 24 m                          | `buildTrack` rejects narrower control points                                                           |
| Sectors      | 3 of equal length             | Timing sectors and anti-cut checkpoints (see [laps.md](laps.md))                                       |

So a new track only needs a shape; kerbs and gravel follow the corners automatically.

**Fixed rule for every track (owner's decision):** each track must show its **sector detection
points**. At the start of every timing sector there is a gantry visible from far away (posts behind
the walls, board across the track labelled `S1`/`S2`/`S3`, yellow line on the asphalt; S1 is the
start line). They are generated automatically from `TRACK_RULES.sectorCount` and `sectorEnd()`, the
same boundaries the timing uses (see [laps.md](laps.md)). Never place them by hand, and if sector
positions ever become per-track, the gantries must follow them.

## Queries (`track/query.ts`)

- `locateOnTrack(track, p)`: closest centreline point, segment index, tangent, **signed lateral
  offset** (+ = right), distance along the lap and the **local half-width**. Uses the centreline `SegmentGrid` near the track
  and a full scan when far away.
- `surfaceAt(track, p)`: lateral offset → band → surface:
  1. asphalt within the local `halfWidth − 0.6`;
  2. kerb or high kerb in the kerb band, if that side has one there;
  3. asphalt up to the edge;
  4. beyond the edge, the side's run-off (grass/gravel).
- `gridSlot(track, slot)`: staggered starting grid, 10 m + 8 m per slot behind the line, two columns 4 m either side of the centreline.

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

"Test Ring", ~1.94 km, clockwise seen from above, **24–32 m wide**, 10 m run-off. Designed from
scratch for the wide asphalt: every corner radius stays above local half-width + run-off, and
distant sections keep ≥ 30 m of clearance beyond their walls.

| Points | Section                                                                   | Width   |
| ------ | ------------------------------------------------------------------------- | ------- |
| 0–2    | Main straight (~470 m), start line at point 0                             | 32 m    |
| 3–6    | Hairpin (radius ~45 m): wide entry for late-braking overtakes, gravel out | 30→28 m |
| 7–11   | Short run into the fast chicane, **high kerbs** on the inside             | 26→24 m |
| 12–15  | Fast left sweeper onto the back straight                                  | 28 m    |
| 16–21  | Long double-apex right: the drift showcase                                | 28 m    |
| 22–24  | Fast kink, flat out                                                       | 26 m    |
| 25–27  | Medium right back onto the main straight, gravel outside                  | 28→30 m |

Tests (`track/buildTrack.test.ts`) guard the layout: closed loop of ~2 km, never narrower than 24 m
(and the width really varies), walls never fold back, distant sections keep their run-offs apart,
kerbs only in corners, high kerbs only in the chicane.

## Kruncar (`track/layouts/kruncar.ts`)

"Kruncar", ~2.56 km, clockwise, **24–32 m wide**, 10 m run-off. Inspired by the Krunker.io map
"KrunCar" by Keybi (https://krunker.io/?game=FRA:qtesb): the owner's description of the corner
sequence plus 14 screenshots (kept locally in `02_screen_krunkerMap/`, git-ignored). Not a 1:1 copy:
Krunker's square 90° corners become round ones (radius ≥ 45 m, ≥ 42 m in the wooden section) so the
walls never fold, elevation is flattened (2D sim), widths follow our ≥ 24 m rule.
Sized for the owner's target: **Hard bot ≈ 45 s a lap** (the Krunker record is 1:25.4 for 2 laps).

Corners are circular arcs sampled every 30°: with uneven spacing the spline tightens between points
and the walls fold. The layout was drafted with a turtle script (straights + arcs) and closed by
solving two straight lengths; edit it the same way, keeping arc points evenly spaced.

| Points | Section (Krunker landmark)                                                  | Width   |
| ------ | --------------------------------------------------------------------------- | ------- |
| 0–3    | Main straight between the grandstands, start line at point 0                | 32 m    |
| 4–10   | 90° right, immediately 90° left                                             | 30 m    |
| 11–17  | Short straight into the first hairpin (180° right), wide for braking        | 28→32 m |
| 18–19  | Straight over the plank bridge (river)                                      | 26 m    |
| 20–24  | S-bend (left, immediately right), short straight                            | 26→28 m |
| 25–28  | Right, a bit of straight                                                    | 28 m    |
| 29–34  | Second hairpin (180° left)                                                  | 28 m    |
| 35–36  | Straight along the barn and the hay bales                                   | 28 m    |
| 37–42  | Third hairpin (180° right)                                                  | 30 m    |
| 43–55  | **Wooden section**: covered bridge + ramp, left-right steps, **high kerbs** | 24 m    |
| 56–65  | Straight, then left, right onto the main straight's line, left              | 28 m    |
| 66     | Over the bridge to the line                                                 | 30 m    |

Bot laps (alone, baseline v1 car): Hard 45.0 s, Medium 50.3 s, Easy 63.8 s, all clean.
Scenery (river, wooden bridges, grandstands, hay bales, barn) is step 9a.2.
Tests (`track/buildTrack.test.ts`): every track in `TRACKS` passes the generic layout checks; Kruncar
also checks its length and that high kerbs and the 24 m minimum are only in the wooden section.

## Making a new track

1. Copy `layouts/testTrack.ts`, change `name` and `points` (driving order, closed loop, no crossings),
   giving each point a `width` ≥ 24 m (wider where you want overtaking room).
2. Keep corner radii above the local half-width + `runoffWidth` (22–26 m here) plus a margin, or the
   inner wall folds back (the "walls never fold" test catches it). Keep distant sections apart by
   at least both half-widths + 2 × run-off.
3. List chicanes or corners that need high kerbs in `highKerbs` (control point index ranges).
4. Export it from `track/layouts/index.ts` and add it to `TRACKS` there (the track menu lists
   that array, in order), then run the tests.
5. Add a section for it in this doc, like the Test Ring table above.

Planned (Phase 1 step 9, see [roadmap.md](roadmap.md)): Kruncar's scenery (9a.2), then Monza,
Barcelona and Monaco inspired layouts.
