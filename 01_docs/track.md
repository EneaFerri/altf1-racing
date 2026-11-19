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
A track can instead ask for low kerbs along **both edges everywhere** (`kerbs: 'everywhere'`; no
circuit of the game uses it since Kruncar was removed); high kerbs and gravel stay as above.

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
  The real circuits paint `GRID_SLOTS` (20) of them ([themes.md](themes.md#theme-system)); a test
  checks that every box lies on asphalt at Monza, Barcelona and Monaco.

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

**A test fixture only** (step M.1): not in the game's menus, never offered online, no theme. The
tests (sim, collisions, bot, server, prediction) drive on it. "Test Ring", ~1.94 km, clockwise seen from above, **24–32 m wide**, 10 m run-off. Designed from
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
- The bot drives one road: see [bot.md](bot.md) (`shortcuts`). No circuit of the game has a
  shortcut branch since Kruncar was removed; the pit lanes use the same machinery.

The real circuits' pit lanes (Phase 4, Grand Prix only) are routes too, built on request and
allowed over the start line: [pitlane.md](pitlane.md#drivable-4f).

## Real circuits (`track/layouts/monza.ts`, `barcelona.ts`, `monaco.ts`)

Generated from open data (OpenF1 + OpenStreetMap) by `01_tools/openf1/`, never edited by hand: real
shape, real widths, real sector positions, scaled so the Hard bot laps in the real pole time. Only
normal kerbs (no high kerbs), with a wider band (`kerbBand`). All in [circuits.md](circuits.md). They pass the same layout tests as every track.

## Making a new track

The game offers only the real F1 circuits (owner, 2026-11-19): see [circuits.md](circuits.md).
For a new test fixture:

1. Copy `layouts/testTrack.ts`, change `name` and `points` (driving order, closed loop, no crossings),
   giving each point a `width` ≥ 24 m (wider where you want overtaking room).
2. Keep corner radii above the local half-width + `runoffWidth` (22–26 m here) plus a margin, or the
   inner wall folds back (the "walls never fold" test catches it). Keep distant sections apart by
   at least both half-widths + 2 × run-off.
3. Optionally `kerbs: 'everywhere'`.
4. List chicanes or corners that need high kerbs in `highKerbs` (control point index ranges).
5. Export it from `track/layouts/index.ts` (not in `GP_TRACKS`: that list is the game's circuits),
   then run the tests.

Real circuits (Phase 1 step 9, see [roadmap.md](roadmap.md)): Monza, Barcelona and Monaco done.
