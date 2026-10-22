# Decision Log

## 2026-10-21 — Stack: TypeScript + Three.js + Vite

- Everything is plain code (no editor-only scene/binary files) → easy to generate and review.
- Three.js is what Krunker.io uses; the look we want is native to it.
- One language for client and future server → the simulation is shared 1:1.
- Rejected: Godot/Unity (editor-centric workflow, harder to review diffs, no shared server code).

## 2026-10-21 — Custom arcade physics, no physics engine

- Arcade feel needs direct control over grip and yaw; a rigid-body engine fights that.
- Deterministic and unit-testable. Rapier may be added later for collisions only.

## 2026-10-21 — Product choices (from owner)

- Platform: browser first, keep desktop packaging easy.
- Look: Krunker-faithful (low-poly, nearest-filtered textures, full-res render).
- Third-person camera: chase cam by default.
- Language: English everywhere.

## 2026-10-21 — SI units and ground-plane axes

- The Model uses metres, seconds and radians; km/h exists only in the View.
- 2D vectors are `{ x, z }` (Three.js ground axes) and `heading` 0 = −Z, so `rotation.y = heading`
  with no conversion layer — fewer sign bugs between Model and View.

## 2026-10-21 — Kinematic car model instead of a tyre model

- Velocity split into forward/lateral parts, lateral part damped by `lateralGrip`; yaw driven
  directly by steering and speed. Few, intuitive parameters (see physics.md), easy to tune for fun.
- A tyre/slip-curve model (Pacejka-style) would be more realistic but harder to tune for arcade fun.
- Steering smoothing lives in the Model, so the server reproduces it exactly.

## 2026-10-21 — Dev tools via dynamic import

- lil-gui is a devDependency, imported only inside `if (import.meta.env.DEV)` → zero cost in production.

## 2026-10-21 — Multi-car state from step 4

- `GameState.cars` (sorted by id) and `stepGame(state, { [carId]: input }, ctx)` before any opponent
  exists: collisions, AI and networking will all plug into the same shape without refactors.
- Static data (track, params) goes in `SimContext`, not in the state: cheap ticks, small snapshots.

## 2026-10-21 — Tracks compiled from a spline, kerbs and gravel automatic

- Hand-authoring only control points keeps layouts quick to edit; `buildTrack` derives samples,
  kerbs (by curvature), gravel (outside tight corners), walls and grids deterministically.
- Explicit data only where design intent matters: high kerbs (`highKerbs`).
- Surfaces sampled per wheel and averaged, so half a car on the grass feels like half a penalty.
- High kerbs kick via `CarState.spin`, the same channel impacts will use.

## 2026-10-21 — Wider track (≥ 24 m) and a new layout

- Owner feedback after 4a: the 12 m track was too narrow for the car. Asphalt is now **variable
  width, never below 24 m** (`TRACK_RULES.minWidth`, enforced by `buildTrack`); width is set per
  control point and eased along the spline.
- The old layout could not simply be widened (chicane/hairpin inner walls would fold, sections would
  overlap), so the owner chose a **new layout designed for the size** (~1.94 km, 24–32 m), keeping
  the same sequence of features: long straight, hairpin, chicane with high kerbs, sweeper,
  double-apex, kink, final corner.

## 2026-10-21 — Smoother steering, camera on V

- Owner feedback: A/D turning felt abrupt. `yawRate` now has **inertia** (`yawResponse`), so corners
  are fluid instead of a step on every key press.
- The camera toggle is V (owner's choice), the usual view key in racing games.

## 2026-10-22 — Audit cleanup

- Removed unused code (`cross()`, `GameLoop.stop()`, `KeyboardController.dispose()`, phase-0 texture
  defaults and smoke test, obsolete `.vite/` ignore). They come back only when something uses them.
- `Surface` moved to `track/types.ts` so `config/` no longer depends on query code.
- Vite `chunkSizeWarningLimit` raised to 700 kB: Three.js alone is ~530 kB and can't be split further,
  so the default warning was permanent noise.

## 2026-10-22 — Collisions: own circle solver, forgiving by design

- Owner requirement: crashes must be fun and must not end the race or wreck the handling. Owner choices:
  "F1 arcade" car-vs-car intensity, a parked dummy car for testing, no visual or sound effects yet.
- **Own deterministic solver, not Rapier**: 3 circles per car + one-sided wall segments are enough, it
  stays inside `shared` (server-ready, no WASM), and every rule can be bent for feel. Rapier stays an
  option only if we ever need real rigid-body stacks.
- Collisions change only position, velocity and spin, so `stepCar` keeps its handling untouched.
- **Wall alignment assist**: walls turn the nose parallel to themselves. Without it, grip keeps pulling
  the car back into the wall and every scrape becomes a speed sink.
- **Spin kicks don't stack, and gentle contacts give none**: measurements showed tangled cars winding
  each other up to 60–75° through repeated small hits. With max-instead-of-sum and a minimum impact
  speed, the worst case stays under 30°.
- No damage model: it would punish the player for the whole race, the opposite of the goal.

## 2026-10-22 — Cameras: params in the client, cockpit glued to the camera

- Camera values are view-only, so `CAMERA_PARAMS` lives in `client/src/view/cameras/params.ts`, not in
  `shared/config` (which is for the simulation the server will run). It is tuned live from F2 like the
  physics (owner's choice: panel sliders, not in-game keys).
- First person shows the real nose + front wing (owner's request: judging direction and distances needs
  real perspective, so it is world geometry, not an overlay), plus a steering wheel and thin cockpit
  sides (owner's choice). A slim front tub in the car's colour (world geometry, first person only)
  joins the nose to the wheel, which otherwise looked like it was floating. The wheel and sides are a camera child laid out in screen units, so they
  cover a fixed small part of the screen at any window size or FOV. They are drawn with no depth test, so walls never cut through them
  when scraping.

## 2026-10-22 — Lap timing: free practice, sectors as checkpoints

- Owner's choices: free practice (endless laps, no start lights), 3 sectors with F1 colours, a reset
  invalidates the lap (no track-limits rule), a slim F1-like HUD at the top centre.
- Timing is simulation state in `shared` so the server can time laps later; times are integer ticks
  (deterministic; 16.7 ms is plenty for practice).
- The sectors double as checkpoints: only the next expected boundary counts, crossed going forward.
  That is enough because walls already stop real shortcuts.
- HUD in a system sans-serif with tabular figures: no font dependency, works offline and in a desktop
  wrapper.

## 2026-10-22 — Tuning frozen as a versioned baseline

- Owner's choice: the values in the repo become the defaults, with a status and version
  (`TUNING_BASELINE` in `shared/config/tuning.ts`). v1 (provisional) at the end of step 7; **v2
  (final)** after step 9a.5, the owner's reference setup (git tag `baseline-v2`).
- The flag is data, not a mode switch: the defaults are always the config files, and re-tuning uses the
  existing dev panel (F2 → Copy as code → paste → bump the baseline). No second "dev" set of values to
  keep in sync.
- The label is shown only in dev tools (F2 title, F3 overlay); players never see it.

## 2026-10-22 — Bot and tracks before multiplayer

- Owner's choice: two more Phase 1 steps before Phase 2. Step 8, a local bot with Easy / Medium /
  Hard levels; step 9, Monza, Barcelona and Monaco inspired tracks plus one inspired by a Krunker.io
  custom map (the project's visual reference; which map is still to be named).
- The bot is a real car in `GameState` with collisions, not a ghost: a real opponent, and the same
  path the server will use for bots and remote players.
- The AI only produces `InputCommand`s and stays pure in `shared`, so the server can run it in Phase 2.
- No menus yet: the bot level and the track are switched with keys, the level shown on screen.
  (Track part superseded the same day: see "Track menu" below.)
- Bot lap and sector times are not displayed (owner's choice): the level sets its pace, the timing HUD
  stays the player's.

## 2026-10-22 — Bot: input source, relaxed racing line, yaw-based speeds

- The bot sits outside the simulation and only sends `InputCommand`s; `stepGame` is unchanged. Its
  only memory (stuck counter) is plain data kept by the caller, so client and server can both run it.
- Racing line by iterative relaxation (each point to the midpoint of its neighbours, clamped to the
  allowed width): simple, deterministic, ~4 ms per build. Shifting the line to the inside of corners
  was tried first and was slower the more it cut.
- Corner speeds come from the car's `CarParams` (yaw limit), not from hand-set numbers per corner, so
  any track and any re-tune of the car keep working. Levels are multipliers on that.
- Owner's choices: blue livery for the bot, Medium at start, no bot timing on screen.
- `placeCarAhead` became `placeCar` (signed distance, adds a missing car) plus `removeCar`, used both
  by the bot (B) and the dev dummy (F4).
- Owner's feedback after driving: Easy kept, the first Medium dropped, the first Hard became Medium.
  Hard gets a +3% car (`performance`, through the per-car `SimContext.carParamsById`) and, on
  Kruncar, the shortcut.

## 2026-10-22 — Track menu before step 9

- Owner's choice: the Test Ring stays playable next to the new tracks, and the track is picked in a
  small start menu instead of with a key. The first new track is "Kruncar", inspired by a
  Krunker.io map ("KrunCar" by Keybi), sized so the Hard bot laps it in 40–45 s.
- The track list (`TRACKS`) lives in `shared`, not in the client: the server will offer the same tracks.
- Esc goes back to the menu with a page reload rather than tearing `Game` down: the renderer, the
  listeners and the dev panel all go away for free, and there is no state worth keeping yet.
  Revisit when there is (settings, multiplayer session).

## 2026-10-22 — Kruncar: layout from screenshots

- No map file is available (the owner isn't the map's author, so the Krunker editor can't export it):
  the layout comes from the owner's description of the corner order and 14 in-game screenshots.
  The screenshots stay local (`02_screen_krunkerMap/`, git-ignored, ~22 MB).
- Layout drafted as straights + circular arcs, then closed by solving two straight lengths, and sized
  by measuring the Hard bot until it lapped in ~45 s (owner's target). Shape first (9a.1), scenery
  later (9a.2), so the geometry can be reviewed on its own.

## 2026-10-22 — Kruncar look: themes per track, kerbs everywhere

- A track's look is a `TrackTheme` in the client, picked by track name (`themeFor`): the simulation and
  the server never need it, so it stays out of `TrackDefinition`. The Test Ring keeps the original
  look as the "classic" theme.
- Owner's choice: Kruncar's pink/white kerbs run along every edge **in the physics too** (new
  `TrackDefinition.kerbs: 'everywhere'`), so what you see is what you drive; and the fence comes
  closer (run-off 10 → 6 m). Bot lap times didn't change (its line keeps 3 m from the edge).
- Bridge decks are drawn over the asphalt but stay asphalt in the physics: same grip, no new surface.
- Scenery positions are plain data tested against the track (nothing inside the walls, rivers only
  under bridges); trees are seeded so the map looks the same on every load.

## 2026-10-22 — Forks: branches as extra routes, one wall outline

- Owner's choice: a **real fork** (not a wide road with an island drawn on it), the narrow road 14 m
  wide as an exception to the 24 m rule, Hard bot on the shortcut.
- A branch is compiled as a whole alternative loop (`Track.routes`) with the existing `buildTrack`
  machinery, rather than a new "graph" track model: the simulation, laps, bot and view keep working
  on closed loops, and only `locateOnTrack` (which road am I on?) and the wall outline know about
  forks. Progress on a branch is mapped onto the main loop, so lap timing needs no change.
- Walls of overlapping roads are cut where they lie entirely inside another road's drivable area,
  and kept where only partly inside: no gaps at the island's tips, at worst a short stub.
- The shortcut is ~10% shorter but slower for the bot (−2 s for Hard): the owner may want it
  faster; tune the zigzag's angle (`±12.5°` now) to trade difficulty against time.

## 2026-10-22 — Brake with pressure, S reverse (step 9a.4)

- Owner feedback: forward/back and steering feel right, the on/off brake doesn't. Space is the brake,
  S reverses (braking first while rolling forward), C is unbound.
- **Brake pressure** lives in the Model (`CarState.brakePressure`), like the smoothed steering, so the
  server computes the same braking: 30% on a tap, full after 0.6 s held, gone 0.1 s after release.

## 2026-10-22 — Drift: three designs, then removed (steps 3–9a.5)

- Step 3: an easy arcade drift (Space + steer; locked side, bounded slip, speed kept on exit), later
  blended into the current turn. Step 9a.4: no drift key, braking too hard in a fast corner slid the
  car. 9a.5: a smaller drift started by fast corners alone. The owner rejected each after driving:
  **grip-only handling**, the brake only slows the car down.
- Removed everything drift-related (Model state and params, surface/collision drift rules, bot drift
  logic). Hard's narrower racing line, only there for the drift, went back to the full width. The
  code is in git history (before tag `baseline-v2`) if it ever comes back.
- With it, the owner's F2 values became the defaults (`maxYawRate` 1.8 → 2.7, `yawResponse` 7 → 9.5),
  and Easy's `cornerSpeed` 0.65 → 0.5 keeps it ~20% slower than Medium.
