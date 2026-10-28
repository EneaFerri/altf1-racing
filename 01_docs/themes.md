# Track themes & scenery

How a track _looks_: sky, light, ground, asphalt, kerbs, walls and the props around it. View only:
the simulation never sees a theme. Code in `01_packages/client/src/view/themes/` and
`01_packages/client/src/view/scenery/`.

## Theme system

- `themes/theme.ts`: the `TrackTheme` interface and `themeFor(trackName)`. **Kruncar**, **Monza**,
  **Barcelona** and **Monaco** have their own theme; every other track gets **classic** (`themes/classic.ts`: the original look,
  Test Ring).
- `SceneView` reads the theme for sky colour, fog, camera far plane (`viewDistance`), hemisphere light
  plus an optional directional "sun", the ground (texture, tile size, margin past the track; the
  ground is centred on the track's bounds) and adds the theme's scenery.
- `createTrackView` draws every road (main loop and branches). Kerbs, edge lines and gravel appear
  only where the physics puts them on that road (`locateOnTrack(...).route`), so no kerb crosses the
  mouth of the other road at a fork. It reads asphalt texture, kerb colours and block length, where the white edge line
  sits (`edgeLineInset`) and the wall style per wall segment:
  `tyres` (classic), `fence` (wooden rails on posts, see-through), `concrete` (grey wall with a
  chain-link fence on top), `armco` (steel guard rail on posts, see-through), `armcoFence` (armco
  with a 3.3 m catch fence on top: the street circuit). The physics wall is the same whatever the
  style.
- **Starting grid** (`gridBoxes`, step 2.3a): real circuits (`realCircuitTheme`) paint `GRID_SLOTS`
  (20) F1-style boxes, one at each `gridSlot` where cars spawn: a white line across just in front of
  the nose and a short tick down each side, open at the back. Test Ring and Kruncar have none
  (frozen looks).
- The ground is split into 50 m cells: one huge quad loses depth precision near the camera and
  hid the track's surfaces just above it (seen first at Monaco).
- Props are built once per track by `theme.scenery(track)`.

## Kruncar theme (`themes/kruncar.ts`)

After the Krunker.io map "KrunCar" by Keybi (owner's screenshots in `02_screen_krunkerMap/`).

| Element  | Look                                                                  |
| -------- | --------------------------------------------------------------------- |
| Sky      | Pale mint `#bfe8d8`, fog only far away (350–1600 m)                   |
| Backdrop | Ring of big grey low-poly mountains (flat-shaded, no fog), 5 balloons |
| Asphalt  | Light grey `#7c7c80` with sparse darker/lighter specks                |
| Kerbs    | Pink/white `#f2a0a0`/`#ffffff`, 2 m blocks, along **every** edge      |
| Line     | White edge line inside the kerb                                       |
| Grass    | Bright lime `#8bbd45` with blocky darker/lighter blots, 16 m tiles    |
| Walls    | Concrete + chain fence on the main straight, wooden fence elsewhere   |
| Light    | Hemisphere (sky white, ground olive) + a sun so facets read           |

Kerbs everywhere and the 6 m run-off are **physics** too (`TrackDefinition.kerbs`, `runoffWidth`),
see [track.md](track.md#kruncar-tracklayoutskruncarts).

Props (positions in `themes/kruncarLayout.ts`, plain data checked by tests):

- **Grandstands** both sides of the main straight (2 × 100 m per side, 3 m behind the wall):
  7 stepped rows with a pixel crowd, concrete back wall, white striped roof; floodlight towers at
  their ends.
- **Rivers** (dark teal water, dirt banks), each ending in a pond: under the plank bridge (point
  17's straight); from the south under a plank bridge on the fork's wide road, then under the
  covered bridge on the zigzag shortcut; under the bridge just before the finish.
- **Bridges**: plank deck drawn over the asphalt between the kerbs (view only: grip stays asphalt);
  the one on the shortcut is **covered** (posts on the wall line, plank walls, gable roof).
- **The zigzag shortcut** is Krunker's wooden part: planks over its whole length.
- **Barn** inside the third hairpin, **hay-bale stacks** around the second hairpin and the barn
  straight.
- **Chevron boards** (red, white arrows pointing the turn's way) on the outside of every corner
  tighter than 70 m radius, 2.5 m behind the wall, facing the approaching cars. Automatic from the
  track's curvature (`cornerApexes`), so any track could use them.
- **Trees**: 260 seeded low-poly trees (instanced), never closer than 7 m to a wall and kept off
  rivers, ponds, stands, barn and hay.

## Real circuits: scenery from OpenStreetMap

The real circuits' surroundings come from OSM, like their shape ([circuits.md](circuits.md)).
`01_tools/openf1/scenery.ts <id> [--fetch]` downloads (Overpass) the circuit's grandstands
(`building=grandstand`), buildings within 250 m of the centreline, the relation's `pit_lane` way,
woods (`landuse=forest`, `natural=wood`) and old raceways (`highway=raceway`) into
`data/<id>.scenery.json` (committed, ODbL attribution inside), then writes the **generated**
`themes/<id>Layout.ts` (never edit by hand: change the tool and re-run it).

- **Same frame as the track**: `profile.ts` stores `osmFrame` (the rigid fit of the OSM centreline
  onto the OpenF1 lap) in `data/<id>.json`; every OSM feature goes through it, then through
  `toGame` (orientation and scale, shared with `generate.ts`).
- **Track-relative positions** (`TrackSpot` = lap fraction + metres beyond the wall, + right):
  the game's track is wider than the real one, so stands and buildings are stored relative to the
  wall, not in absolute metres. A footprint is moved out as a whole until its nearest point is
  ≥ 3 m beyond the wall. Its points are located within 200 m (along the lap) of its centre's, so a
  corner never jumps to another stretch passing behind it. Dropped: footprints straddling the
  track, and those that would land closer to another stretch's wall than to their own (3 m, or
  beyond the pit lane on its side): the wider game track can swallow the real room between two
  stretches (e.g. a pit building at Barcelona).
- **Filters**: grandstands shorter than 12 m (kiosks, camera towers) or further than 250 m from the
  real asphalt are left out.
- **Pit lane** (12 m real, × scale): decorative behind a 1 m pit wall (drivable later). Its ways
  (entry, lane, exit) are joined into one line in the driving direction; each point is located
  near the previous one's station (within 60 m plus the step), so the lane follows one stretch even
  where another runs close on its other side, and points running back are dropped. Only the
  longest run (along the lap) that really is beyond the wall, points and the way between them, is
  kept: where the real lane cuts a corner the wider game track can leave it no room (Monaco's,
  from La Rascasse by the Piscine). Pit buildings are those within 80 m of it, moved out beyond
  its outer edge with the stands beside it.
- **Hand-placed grandstands** (`CircuitConfig.stands`: real distance, length, depth, side) where
  OSM has none (temporary stands): the same rules, an error if there's no room.
- **Woods**: absolute polygons in game coordinates, filled with seeded trees.
- **Old oval** (Monza's _sopraelevata_): kept as scenery. Dropped where it runs along the GP track,
  raised on a bridge (8 m deck, 70 m ramps, piers) where it crosses it, banked in its curves
  (≤ 0.45 rad), cut where its deck would touch the GP walls on the ground.

Builders: `scenery/realCircuit.ts` (`createPitLane`, `createOldRaceway`), `createPitBuilding` in
`scenery/buildings.ts`, `polylineRibbon`/`surfaceBetween` in `view/ribbon.ts`.

**`themes/realCircuitTheme.ts`** turns a generated layout (`RealCircuitScenery`) and a look
(`RealCircuitLook`: sky, fog, light, ground, kerbs, tree builder) into a `TrackTheme`, the same for
every real circuit:

- **Stands drawn clear of the track** (`standPieces`, `fitsBeside` in `scenery/placement.ts`): the
  model is a straight box (~10.4 m deep, roof 3 m over its front). Where a stand's box, aligned with
  the track at its middle, would cut into the run-off on a bend (body < 0.5 m beyond the wall, roof
  > 2.5 m over the run-off), it is drawn instead in ~15 m pieces following the track at the
  > footprint's nearest gap; pieces that still don't fit are left out. Today: Monaco's three stands,
  > Barcelona's G, N and T10, Monza's Prima Variante Esterna and Ascari Tre.
- **Props**: the stands, pit buildings, pit lane and old raceways (if any); trees dense in the real
  woods (≤ 400 per wood, 2400 in all) and sparse in the open (500), kept off all of them.
- **Walls**: `concrete` by the stands and the pit lane (15 m past each end), `tyres` where the
  run-off is gravel, the look's `barrier` everywhere else (`armco` by default).
- **Town** layers when the layout has them (see below); the look can turn the trees in the open
  off (`parkTrees`).

### Town circuits (`CircuitConfig.town`: Monaco)

Extra OSM layers, absolute in game coordinates (only for town circuits: Monza and Barcelona are
unchanged):

- **City**: every building (ways and multipolygon relations) within 200 m of the centreline, with
  its height (`height`, else `building:levels` × 3.2 m + 1, else by type: house 8, church 16, …,
  18 m), simplified to 0.5 m. Vertices closer than 1.5 m to the wall are pushed out along the
  track's normal (the street canyon stays); dropped where the footprint straddles the track,
  except **over the tunnel**, where it stands on the roof (`base` = 8 m: the Fairmont), and where
  it would stand on the stands, the pits or the pit lane.
- **Sea**: the coastline chained into lines; OSM draws it with the land on its left, the game's
  z = −y mirrors that, so the water is on the left of the line in game coordinates. Lines are cut
  by a box 700 m around the track and closed along its edges; closed loops are lakes or islands.
  Resampled every 5 m and kept 2 m beyond the wall.
- **Piers** (lines or areas) and **pools** at least 1 m beyond the wall; **palms** (OSM tree
  nodes) at least 4 m, never inside a building.
- **Tunnel**: the lap fractions of the relation's ways tagged `tunnel` (the street ways, not only
  `raceway`s).
- **Landmarks** (`CircuitConfig.landmarks`: name → kind): the building of that name, or the one
  holding an OSM POI of it (else the nearest within 40 m), is marked (`landmark`) and drawn with
  its own model instead of a plain block. Monaco: the Casino (POI "Casino de Monte Carlo") and the
  Chapelle Sainte-Dévote (the Hôtel de Paris's building is left out by grandstand B).
- **Pit garages**: a row of temporary boxes (10 m real deep, ~60 m long) just beyond the pit lane
  where it runs, over its middle (15% at each end are entry and exit), shallower where another
  stretch is close behind, left out where none fits; OSM's apartments are never used as garages.

Builders: `scenery/town.ts` (`createCity`: walls and flat roofs merged into one mesh per material,
Riviera pastel facades (`createFacadeTexture`) picked per building, glass above 45 m, terracotta
roofs below 20 m; `extrude`; `createSea`, `createPiers`, `createPools`, `createPalms`),
`scenery/landmarks.ts` (`createCasino`: Belle Époque walls, a copper mansard and two towers on the
side facing the track; `createChapel`: ochre walls, tiled pyramid roof, bell tower),
`scenery/yachts.ts` (`createYachts`: instanced hulls with a pointed bow, white or navy, a white
superstructure with dark windows, a second deck above 26 m), `scenery/tunnel.ts`
(`createTunnel`: walls past the run-off, a 6.5 m ceiling with glowing strip lights every 6 m, the
roof's top at 8 m, portals). The sea sits 15 cm above the ground with a polygon offset: big flat
triangles fight with it far away. Behind the town, hills (`createMountains` on an arc of 2.4 rad
on the side away from the sea, green-grey).

`mooredBoats` (`scenery/placement.ts`, pure, tested) moors yachts stern-to, Monaco's way: along
both sides of pier lines and the outer side of each edge of pier areas (all of Port Hercule's are
areas), one every beam + 1.2 m, seeded 14–46 m long; kept only with every corner on the sea and
off the pontoons, the bow 1 m from any pier, 3 m beyond the walls, never overlapping another.

`themes/realCircuitLayouts.test.ts` checks every real circuit: stands beyond the walls and clear of
the pit lane, pit lane behind the wall on the inside of the main straight and running along the
lap, buildings behind it, trees in the woods off the track (Monza also: the oval never on the
track, on a bridge where it crosses; Monaco: hundreds of buildings, every vertex beyond the walls
except on the tunnel roof, the tunnel where it really is, sea, pools, piers and palms off the
track, the Casino and the chapel, hundreds of yachts on the water and off the track).

## Monza theme (`themes/monza.ts`)

The Parco di Monza: pale blue sky, fog 450–2200 m, striped green park grass, broadleaf trees,
red/white kerbs. Props from `themes/monzaLayout.ts` (generated): 42 real grandstands, pit lane and
pit buildings on the inside of the main straight, the old oval with its bridges, 41 woods.

## Barcelona theme (`themes/barcelona.ts`)

Mediterranean (owner's choice): warm hazy sky, fog 450–2000 m, warmer and stronger sun, dry
straw-and-olive grass with bare ochre earth (`createDryGrassTexture`), umbrella pines
(`createPines`: tall bare trunk, wide flat crown), red/white kerbs. Props from
`themes/barcelonaLayout.ts` (generated): 17 real grandstands (Graderia principal, A–N, T1, T10), the
pit lane on the inside of the main straight (entry before the last corner, exit at turn 2) with 5
pit buildings, 8 woods. Only the GP circuit: the karting, motocross and old-chicane raceways around
it are left out (owner's choice).

## Monaco theme (`themes/monaco.ts`, step 9d.2a)

A street circuit: bright Riviera sky, fog 500–2400 m, pale stone paving as the ground
(`createPavingTexture`), red/white kerbs, guard rails with tall catch fences (`armcoFence`),
tyres where there's gravel. From `themes/monacoLayout.ts` (generated): ~300 buildings with their
real heights (towers up to 80 m), Port Hercule and the sea with 27 pontoons, 34 pools (the Rainier
III stadium on the quay), ~150 palms, the tunnel along the sea under the Fairmont (two footprints
on its roof), three grandstands placed by hand (B at the Casino, K at Tabac, T from the Piscine to
La Rascasse: the owner wanted few), the pit lane along the start straight with its garages. Pines
in OSM's woods, no trees in the open. 9d.2b: yachts moored stern-to in Port Hercule, the Casino
and the Chapelle Sainte-Dévote on their footprints, green-grey hills behind the town.

## Placement rules (`scenery/placement.ts`, pure, tested)

- `clearance(track, p)`: metres outside the walls (negative = drivable area). Every prop keeps a
  positive clearance; `placement.test.ts` checks the Kruncar layout: rivers touch the track only at
  bridges, ponds, barn, hay and stands stay clear.
- `scatter`: seeded random points in an area (optionally `inside` a polygon), with a margin from
  the walls, spacing between points and circles to avoid. Same result on every load. Points far
  from every road skip the wall check (fast enough for thousands of trees).
- `TrackSpot`, `fromTrack`, `alongTrack`: track-relative points and paths → ground points;
  `footprintBox`: the track-aligned box of a footprint (front centre, facing, length, depth).
- `insidePolygon`, `polygonBounds`: for woods.
- `besideTrack`: a spot a given gap beyond the wall on one side, `along` metres from a control point,
  with the direction towards the track (used to face stands and lights).
- `cornerApexes`: one apex per corner (runs of same-way curvature above a threshold).

## Theming a new track

1. Add `themes/<track>.ts` exporting a `TrackTheme`, and map the track's name in `themeFor`.
2. Put prop positions in a plain-data `themes/<track>Layout.ts` and test them like Kruncar's
   (real circuit: generate it with `01_tools/openf1/scenery.ts`, like Monza's).
3. Reuse the builders in `scenery/` (`nature.ts`, `buildings.ts`, `trackside.ts`) and the textures in
   `view/pixelTexture.ts` (tiny canvas textures, nearest filtering: the pixel look).
