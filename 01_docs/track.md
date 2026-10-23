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

- **Width is variable but never below the track's minimum**: `TRACK_RULES.minWidth` (24 m, twice
  the original 12 m) for imaginary tracks; a real circuit declares its own (`minWidth`), its widths
  coming from reality (see [circuits.md](circuits.md)). `buildTrack` throws on a narrower control
  point, so the rule can't be broken by accident.

- **Sample 0 is the start/finish line**, at control point 0. Segment `i` joins sample `i` to `i + 1`.
- The **`Track` is never part of `GameState`**: it is passed in `SimContext`, not cloned per tick
  and not sent over the network (clients will load it by name).

## Automatic rules (`config/track.ts` → `TRACK_RULES`)

| Rule         | Value                         | Effect                                                                                                 |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| Low kerbs    | curvature > 1/110 m           | Both sides of every real corner (apex + exit), extended 8 m before/after                               |
| Gravel traps | curvature > 1/45 m            | Outside of tight corners, from 6 m before to 36 m after (where cars run wide)                          |
| High kerbs   | declared in `highKerbs`       | Inside of each curving sample in the range (replaces the low kerb there)                               |
| Kerb band    | edge − 0.6 m → edge + 1.0 m   | Lateral band where a kerb counts; a track may set its own (`kerbBand`, real circuits: wider)           |
| Walls        | local halfWidth + runoffWidth | One-sided polylines on both sides, `normal` pointing at the track (see [collisions.md](collisions.md)) |
| Min width    | 24 m (or the track's own)     | `buildTrack` rejects narrower control points                                                           |
| Sectors      | 3, equal or at `sectorPoints` | Timing sectors and anti-cut checkpoints (see [laps.md](laps.md)); `Track.sectorStarts`                 |

So a new track only needs a shape; kerbs and gravel follow the corners automatically.
A track can instead ask for low kerbs along **both edges everywhere** (`kerbs: 'everywhere'`, e.g.
Kruncar); high kerbs and gravel stay as above.

**Fixed rule for every track (owner's decision):** each track must show its **sector detection
points**. At the start of every timing sector there is a gantry visible from far away (posts behind
the walls, board across the track labelled `S1`/`S2`/`S3`, yellow line on the asphalt; S1 is the
start line). They are generated automatically from `Track.sectorStarts`, the same boundaries the
timing uses (see [laps.md](laps.md)), so on real circuits they stand where the real sectors start.
Never place them by hand.

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

| Surface      | grip | traction | drag (m/s²) | bumpSpin (rad/s) | Feel                                       |
| ------------ | ---- | -------- | ----------- | ---------------- | ------------------------------------------ |
| `asphalt`    | 1    | 1        | 0           | 0                | Reference                                  |
| `kerb` (low) | 0.85 | 0.95     | 0.5         | 0                | Usable: a small cost for a shorter line    |
| `highKerb`   | 0.45 | 0.7      | 4           | 0.9              | Sausage kerb: kicks the car — don't cut it |
| `grass`      | 0.5  | 0.6      | 5           | 0                | Slow and slippery, recoverable             |
| `gravel`     | 0.35 | 0.4      | 14          | 0                | Trap: kills speed fast                     |

- `grip` multiplies lateral grip, `traction` multiplies thrust and braking, `drag` is extra deceleration.
- **`bumpSpin`**: when a wheel _climbs onto_ that surface, the car gets a yaw kick (left wheel →
  nose kicked right, and vice versa), scaled by speed (×1 at 30 m/s, max ×1.5).
  Staying on the kerb doesn't kick again. The kick goes into `CarState.spin` (see physics.md).
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
| 16–21  | Long double-apex right                                                    | 28 m    |
| 22–24  | Fast kink, flat out                                                       | 26 m    |
| 25–27  | Medium right back onto the main straight, gravel outside                  | 28→30 m |

Tests (`track/buildTrack.test.ts`) guard the layout: closed loop of ~2 km, never narrower than 24 m
(and the width really varies), walls never fold back, distant sections keep their run-offs apart,
kerbs only in corners, high kerbs only in the chicane.

## Branches: forks and shortcuts

A track can offer **alternative roads**: `TrackDefinition.branches` lists, for each, the control
points it leaves and rejoins the main loop at (`fromPoint` < `toPoint`, not over the start line) and
its own points in between. Branch points may be as narrow as `minShortcutWidth` (14 m); the main
loop keeps the 24 m minimum.

- **Routes**: `buildTrack` compiles, per branch, a complete loop driving that branch instead of the
  stretch it skips (`Track.routes[r]`), with `branch` = where the branch runs on it (`from`/`to`) and
  the main-loop distances it replaces (`mainFrom`/`mainTo`).
- **Walls**: one outline for all roads: the main walls plus each route's walls along its branch,
  minus every segment lying entirely inside another road's asphalt + run-off. So the roads open into
  each other at the fork and the join, and the **island** between them is walled. Segments only
  partly inside stay, closing the island's tips without gaps. Each `WallSegment` keeps its `route`,
  `sample` and main-loop `progress`.
- **Locating** (`locateOnTrack`): the point belongs to the road it is most inside
  (`|lateral| − halfWidth` smallest): `route` says which, `index` is that road's sample, and
  `distance` is **main-loop progress** (`routeProgress`: linear across the branch, offset after
  it). Surfaces, lap timing, resets and `placeCar` all go through it, so they work on a branch
  unchanged. `locateOnLoop` ignores branches (one road only).
- The bot drives one road: see [bot.md](bot.md) (`shortcuts`).

## Kruncar (`track/layouts/kruncar.ts`)

"Kruncar", ~2.56 km (main loop; ~2.52 km through the shortcut), clockwise, **24–32 m wide** (14 m on
the shortcut), **6 m run-off** and **kerbs along every edge** (`kerbs: 'everywhere'`), like the Krunker
map (fence close to the track). Inspired by the Krunker.io map "KrunCar" by Keybi
(https://krunker.io/?game=FRA:qtesb): the owner's description of the corner sequence plus 14
screenshots (kept locally in `02_screen_krunkerMap/`, git-ignored). Not a 1:1 copy: Krunker's square
90° corners become round ones (radius ≥ 45 m on the main loop) so the walls never fold, elevation is
flattened (2D sim). Sized for the owner's target: **Hard bot ≈ 45 s a lap** with baseline v2 (the Krunker record is
1:25.4 for 2 laps); an early test map, frozen as it is (~42 s with v3).

Corners are circular arcs: with uneven spacing the spline tightens between points and the walls fold.
The layout is drafted with a turtle script (straights + arcs), closed by solving two straight lengths
(the barn straight and the final straight); the shortcut is solved to land exactly on point 50.

| Points | Section (Krunker landmark)                                                                                                          | Width   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 0–2    | Main straight between the grandstands, start line at point 0                                                                        | 32 m    |
| 3–9    | 90° right, immediately 90° left                                                                                                     | 30 m    |
| 10–16  | Straight into the first hairpin (180° right), wide for braking                                                                      | 28→32 m |
| 17     | Straight over the plank bridge (river)                                                                                              | 26 m    |
| 18–22  | S-bend (left, immediately right), short straight                                                                                    | 26→28 m |
| 23–26  | Right, a bit of straight                                                                                                            | 28 m    |
| 27–32  | Second hairpin (180° left)                                                                                                          | 28 m    |
| 33–35  | Straight along the barn and the hay bales                                                                                           | 28 m    |
| 36–41  | Third hairpin (180° right)                                                                                                          | 32 m    |
| 42–50  | **The fork** (42 → 50): wide road = comfortable left (R 60 m), south, comfortable right, over a plank bridge                        | 26 m    |
| branch | **Wooden zigzag shortcut** (42 → 50): straight on, then six legs swinging ±12.5° around the diagonal, covered bridge over the river | 14 m    |
| 51–60  | Straight, then left, right onto the main straight's line, left                                                                      | 28 m    |
| 61     | Over the bridge to the line                                                                                                         | 30 m    |

The shortcut is ~390 m against ~436 m for the wide road. Bot lap times: [bot.md](bot.md#kruncar).
Its look and scenery (rivers, bridges, grandstands, barn, ...) are in [themes.md](themes.md); the
plank decks (bridges and the whole shortcut) are view only (the physics sees asphalt there).
Tests (`track/buildTrack.test.ts`): every track and route passes the generic layout checks; Kruncar
also checks the fork: 24 m main loop, 14 m shortcut, shortcut shorter than the wide road, cars on
the shortcut located there with progress running on, the island walled off.

## Real circuits (`track/layouts/monza.ts`, `barcelona.ts`, ...)

Generated from open data (OpenF1 + OpenStreetMap) by `01_tools/openf1/`, never edited by hand: real
shape, real widths, real sector positions, scaled so the Hard bot laps in the real pole time. Only
normal kerbs (no high kerbs), with a wider band (`kerbBand`). All in [circuits.md](circuits.md). They pass the same layout tests as every track.

## Making a new track

For a real circuit, see [circuits.md](circuits.md). For an imaginary one:

1. Copy `layouts/testTrack.ts`, change `name` and `points` (driving order, closed loop, no crossings),
   giving each point a `width` ≥ 24 m (wider where you want overtaking room).
2. Keep corner radii above the local half-width + `runoffWidth` (22–26 m here) plus a margin, or the
   inner wall folds back (the "walls never fold" test catches it). Keep distant sections apart by
   at least both half-widths + 2 × run-off.
3. Optionally `kerbs: 'everywhere'`; give it a look in [themes.md](themes.md) (classic otherwise).
4. List chicanes or corners that need high kerbs in `highKerbs` (control point index ranges).
5. Export it from `track/layouts/index.ts` and add it to `TRACKS` there (the track menu lists
   that array, in order), then run the tests.
6. Add a section for it in this doc, like the Test Ring table above.

Real circuits (Phase 1 step 9, see [roadmap.md](roadmap.md)): Monza and Barcelona done, Monaco next.
