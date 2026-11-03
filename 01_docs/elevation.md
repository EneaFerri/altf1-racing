# Elevation (Phase 3)

**One map: Monaco v2**, in single player and (since 3f) in every online mode. Every other track,
Monaco included, stays flat and untouched. Plan and status:
[roadmap.md](roadmap.md#phase-3--elevation-monaco-v2-).

## Data

| What            | Source                                                                                                               | Notes                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Track heights   | OpenF1 `location.z` (decimetres), the pole lap we already use for x/y                                                | F1's own positioning, map-matched like x/y. Its zero is arbitrary. Monaco 2025 pole lap: z 476–895 dm, **41.9 m** of height difference |
| Published check | 41.8 m of rise and fall over the lap ([lightsoutblog](https://www.lightsoutblog.com/the-jewel-in-the-crown-monaco/)) | Matches OpenF1                                                                                                                         |
| Land            | EU-DEM 25 m via [OpenTopoData](https://www.opentopodata.org) (`eudem25m`)                                            | Free: ≤ 100 points per call, 1 call/s. Null over the sea (→ 0). Casino square ~50 m                                                    |

**Alignment**: OpenF1's z has its own zero. By default it is shifted by the median difference to
the DEM along the track (that is what the 3a report below shows). Monaco v2 instead sets its lowest
point, the harbour front, at **2.5 m** above the sea, on its quay (`lowestHeight`, owner's choice:
the median put it at 8.5 m, 6 m above the pontoons, where the DEM's coast cells mix road and sea).
That gives Casino 44.0 m, the start line 5.1 m. The track keeps OpenF1's shape of heights: it is
the road the cars drive; the DEM's 25 m cells smooth the town's steep streets.

## Design

- **Real heights** (owner, after trying the real gradients in 3c: "too much"): the heights in real
  metres, 41.6 m of height difference, not × the circuit's `scale`. The track is 1.133 × longer
  than the real one, so its gradients are that much gentler (steepest 8.8% instead of 10%).
- **Model**: `TrackPoint.height` (optional) → each sample's `height` and `grade` (dh/ds), returned
  by `locateOnTrack`. The simulation stays 2D: the height only adds the slope force.
- **Slope force** (owner: "real, but it must not weigh too much"): along the car's heading,
  −g · `SLOPE_PARAMS.factor` · grade, the factor in `config/` (starts at 0.5) and in the F2 panel.
- **Flat tracks bit-identical**: no heights means grade 0 and no extra term at all; every existing
  test stays unchanged, and a test checks it.
- **Bot**: its speed profile includes the grade (longer braking downhill, slower acceleration
  uphill).
- **Monaco v2**: a `CIRCUITS` entry reusing Monaco's data, with elevation, its own scale calibrated
  on the pole (1:09.954, Hard bot), in `TRACKS` only (single player).
- **View**: every track part at its sample's height; the car's height and pitch from the slope; the
  cameras follow. The terrain mesh comes from the DEM, blended into the track's edges and run-off;
  props stand on `groundHeight(x, z)`; the sea, piers and yachts stay at 0; the tunnel follows the
  track.

## Pipeline (3a ✅)

In `01_tools/openf1/` (its [README](../01_tools/openf1/README.md)):

1. `fetch.ts <id> --no-osm`: the OpenF1 pole lap again, now with `z`. `--no-osm` leaves the
   committed OSM centreline as it is, so the shape can't move. For Monaco the lap, speed and x/y
   came back identical.
2. `profile.ts`: `heights` per station (the car's z at the moment it passed, averaged over ±15 m:
   positions come ~20 m apart). Only when the data has z. For Monaco the profile is identical
   otherwise, and flat Monaco's layout is unchanged.
3. `terrain.ts <id> [--fetch]` (with `--import ./01_tools/resolveTs.ts`): the EU-DEM grid, 25 m, 400 m around the centreline (Monaco:
   72 × 63 points, 46 calls), in `data/<id>.terrain.json` (committed). Then `alignHeights`
   (`elevation.ts`): OpenF1's heights + the median gap to the land under the stations. It prints
   the report below and writes `preview/<id>-elevation.png`: black the track, grey the land above
   it, yellow the sector starts.

## Measured: Monaco (3a)

| What                    | Value                                              | Reference                                                                                        |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Height difference       | 41.5 m (raw OpenF1 z: 41.9 m)                      | 41.8 m published ([lightsoutblog](https://www.lightsoutblog.com/the-jewel-in-the-crown-monaco/)) |
| Highest point           | 50.1 m at 870 m, Casino                            | EU-DEM at Casino square: 50.4 m                                                                  |
| Lowest point            | 8.5 m at 2696 m, Piscine exit (turns 15–16)        | the harbour front                                                                                |
| Start line              | 11.1 m                                             |                                                                                                  |
| Steepest climb (50 m)   | +9.2 % from 340 m, Beau Rivage                     |                                                                                                  |
| Steepest descent (50 m) | −8.3 % from 1275 m, Mirabeau Bas (towards Portier) |                                                                                                  |
| Under the land          | 225 m from 1625 m, the tunnel                      |                                                                                                  |
| OpenF1 → sea level      | −39.2 m                                            |                                                                                                  |

The profile follows the real lap: the climb from Sainte Dévote to Casino, the descent through
Mirabeau and the hairpin to Portier, the tunnel and the harbour front nearly flat, the dip at the
Nouvelle Chicane, a small rise at La Rascasse. The DEM under the road is noisy (its 25 m cells mix
road, cliffs, buildings and sea), so **the track keeps OpenF1's heights**. The DEM only gives the
land around it, and 3d blends the two near the track.

## Model (3b ✅)

- **Track**: `TrackPoint.height` (optional) → `TrackSample.height` (Catmull-Rom through the
  points' heights, so the grade changes smoothly) and `grade` (rise over the samples either
  side); `Track.elevated` when the points have heights; `locateOnTrack` returns `height` and
  `grade`. Without heights everything is 0 and nothing changes.
- **Slope force**: [physics.md](physics.md#slope-phase-3-only-monaco-v2). `SLOPE_PARAMS`
  (`config/slope.ts`): gravity 9.81, `factor` 0.5; `SimContext.slopeParams` (left out:
  `SLOPE_PARAMS`), live in single player (F2 → Slope).
- **Bot**: its braking pass plans with `brakeUse · brakeDecel + g · factor · grade` (less
  downhill, more uphill, never under a quarter of it); `buildBotPlan(..., slope)`.
- **Tests**: flat tracks give exactly the same race whatever the slope settings, and so does a
  track whose heights are all 0; a climb slows the car and a descent speeds it up; a car pulls
  away from rest on a climb and the brake holds it there; the bot laps Monaco v2 cleanly on every
  level, Hard in the pole time.

### Monaco v2 (`layouts/monacoV2.ts`, generated)

A `CIRCUITS` entry built on Monaco's data (`data: 'monaco'`, `elevation: true`): the same shape,
widths and limits, its heights from `elevationOf` (aligned profile) in real metres: 8.5–50.1 m,
steepest grade 8.8% (first built × scale: 9.7–56.7 m, 10%; the owner found it too much). Single
player only; `TRACKS` from 3c.

Calibration: the scale stays **1.133** (the Hard bot laps in 70.02 s, +0.1% on the pole; it was
70.03 s with the scaled heights; the speeds measured below are from those). Over a
closed lap the climb's loss comes back on the descents. Hard bot, flat Monaco vs Monaco v2:

| Measure                   | Monaco (flat)         | v2, factor 0.5        | v2, factor 1 |
| ------------------------- | --------------------- | --------------------- | ------------ |
| Lap (s)                   | 70.05                 | 70.03                 | 70.05        |
| Sectors (s)               | 19.22 / 32.05 / 18.78 | 19.30 / 31.97 / 18.77 |              |
| Top of the climb (km/h)   | 262                   | 259                   | 254          |
| Down to Mirabeau (km/h)   | 233                   | 234                   | 236          |
| Braking for Mirabeau from | 1017 m                | 1014 m                | 1013 m       |

So the slope is mild, as asked: a few km/h on the climb and a few metres of braking. The factor is
for the owner to try in 3c (F2).

## View (3c ✅)

- **Track**: every strip (`ribbon`: asphalt, lines, kerbs, gravel) at its sample's height + its
  layer offset; walls from each end's sample height; start line, grid boxes (each corner at the
  road's height) and sector gantries lifted, the painted lines raised by half their depth × the
  grade so the slope never hides them. On an elevated track a grass strip covers the run-off up
  to the walls (`Y_RUNOFF`), since the ground lies under the road there.
- **Ground** (`scenery/ground.ts`, pure, tested): `trackGroundHeight`: inside the walls the
  road's height − 0.5 m (`GROUND_DROP`); beyond them the lap's heights weighted by 1 / distance⁴,
  continuous everywhere (steep only where Monaco is: up to ~38° between the Casino and the
  stretches below). `SceneView` builds an 8 m grid of it 400 m round the track (~49 000 heights,
  ~50 ms) over a flat square 3 m below the lowest point. 3d replaces the far ground with the land.
- **Car**: `CarPose.y` and `pitch` (`onRoad` in `SceneView`: the road's height under the car and
  atan(grade · cos(heading vs. track))); `CarView` turns yaw, then pitch, then roll (`'YXZ'`: with
  no pitch the same as before). The ghost too.
- **Cameras**: the chase camera and the driver's eye at `y` + their usual heights; the driver's
  view tilts with the car (the other way looking back).
- **Monaco v2 in single player**: in `TRACKS` (the track menu); online since 3f (below). Theme
  `themes/monacoV2.ts`: Monaco's look and walls, no scenery until 3d.
- **Flat tracks** draw exactly as before: every height is 0 and the ground is the flat square.

Fixed after the owner's 3c test: after the Grand Hotel hairpin (Mirabeau Bas) the ground rose up
to 4.5 m above the road (an 8 m ground triangle joining a point under the low stretch to one by a
higher stretch crosses the low one's edge), with smaller spots by the tunnel. `settleUnderRoad`
now checks the road and its run-off every ~1.5 m and lowers the ground's triangles wherever they
rise above it; the grid is built once (`elevatedGround`) and drawn with the same triangles.

## Terrain and town (3d ✅)

- **Land** (`terrain.ts`, for a circuit with elevation): the EU-DEM grid resampled into game
  coordinates, 12.5 m cells, 500 m round the track, the sea (no land in the DEM) at −3 m, written
  as the generated `themes/monacoV2Land.ts`. **EU-DEM is a surface model**: in a town its cells
  count the roofs (22–29 m along the start straight, where the road is at 5–15 m). So it is
  turned into bare ground by a **morphological opening** (the lowest height within 40 m, then the
  highest of those lows): blobs the size of buildings go, the hills stay. From the harbour to
  222 m on the slopes above the town.
- **Ground** (`landGroundHeight` in `scenery/ground.ts`): under the road and its run-off, the road
  less 0.5 m; past the walls the road's heights around up to 40 m, then blending into the land up
  to 200 m (near the track Monaco's streets run at its levels: a better ground than the DEM);
  inside OSM's sea polygons, −3 m: the coast becomes a quay wall. Settled under the road, drawn
  on an 8 m grid (~49 000 points, ~240 ms), paving tinted green-grey from 55 to 95 m up (the
  slopes of the Moyenne Corniche).
- **On the ground** (`scenery/onGround.ts`; flat tracks never pass there): grandstands and pit
  buildings on the lowest ground under their box; the pit lane and pools draped vertex by vertex;
  palms and pines each on the ground under it; every building from the lowest ground under its
  footprint and **at least a floor (3.2 m) above its uphill side**: Monaco's buildings are built
  into the slopes (without it 30 of 301, between two stretches at different heights, ended under
  the ground); those on the tunnel's roof from the road under them (+ 8 m, as on flat Monaco);
  the Casino and the chapel the same. The tunnel follows the road. The sea, pontoons and yachts
  stay at sea level.
- **Theme** (`themes/monacoV2.ts`): Monaco's own scenery and look (`MONACO_SCENERY`,
  `MONACO_LOOK`: the track has the same shape) with `groundHeight` from the land.
- **Tests** (`themes/monacoV2.test.ts`): the land climbs from the sea to over 100 m; the ground
  stays under the road and its run-off; the sea floor lies under the water past the quays; no
  building floats or ends under the ground.

## Online (3f ✅)

After the owner's test (3e: approved, slope factor 0.5), Monaco v2 is in `GP_TRACKS`: the server
opens its rooms in every mode (Free practice, Time trial, Grand Prix) and the circuit menu lists
it. Nothing else changes online: the server's rooms and the client's prediction both build the
track from the same definition and step it with the same `stepGame` and `SLOPE_PARAMS` (the F2
panel exists in single player only), so the prediction stays exact. The view already follows the
heights (cars, ghost, cameras, ground, town); the nickname tags now float over the car's height
(`NameTag.update(x, y, z, …)`).
