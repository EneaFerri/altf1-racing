# Decision Log

## 2026-10-21 — Stack: TypeScript + Three.js + Vite

- Everything is plain code (no editor-only scene/binary files) → easy to generate and review.
- Three.js is what Krunker.io uses; the look we want is native to it.
- One language for client and future server → the simulation is shared 1:1.
- Rejected: Godot/Unity (editor-centric workflow, harder to review diffs, no shared server code).

## 2026-10-21 — Custom arcade physics, no physics engine

- Drift feel needs direct control over grip; a rigid-body engine fights that.
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
- A tyre/slip-curve model (Pacejka-style) would be more realistic but harder to tune and to make drift "easy".
- Steering smoothing lives in the Model, so the server reproduces it exactly.

## 2026-10-21 — Kinematic drift with locked direction

- The drift directly controls the travel direction's turn rate and a bounded slip angle; the side
  is locked on entry. Spin-outs are impossible by construction; steering only tightens or widens.
- Chosen by the owner: "easy arcade" (Mario Kart / Ridge Racer) over a slide you must catch.
- Normal grip was toned down (yaw 2.2→1.6, grip 8→6) so drifting is the faster line at high speed.
- Exiting a drift keeps the car's speed (arcade reward), instead of grip eating the sideways part.

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

## 2026-10-21 — Smoother steering and drift

- Owner feedback: A/D turning felt abrupt, drifts too sudden and off-line.
- `yawRate` now has **inertia** (`yawResponse`); the steering ramp is gentler but full-lock yaw is a
  bit higher (`maxYawRate` 1.8) → slightly sharper but fluid corners.
- Drift **blends from the current turn rate** (`driftTurnResponse`) instead of jumping to its own,
  and holds the nose closer to the travel direction (20° neutral, 30° max, built up over ~0.7 s).

## 2026-10-21 — C brakes too; camera moves to V

- C added as a second brake key for comfort. The planned camera toggle (step 5) moves from C to V
  (owner's choice), the usual view key in racing games.

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
- Drift slip above its cap (only possible after an impact) eases back instead of snapping the nose.

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

## 2026-10-22 — Tuning frozen as a provisional baseline

- Owner's choice: the values in the repo at the end of Phase 1 become the defaults, explicitly marked as
  not final (`TUNING_BASELINE` in `shared/config/tuning.ts`, status `'provisional'`, v1).
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
- Bot lap and sector times are not displayed (owner's choice): the level sets its pace, the timing HUD
  stays the player's.
