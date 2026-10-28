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

## 2026-10-23 — Real circuits from open data (step 9b)

- Owner's rules: real shape (the PNGs in `03_F1Circuits/` as reference), real widths (the 24 m minimum is for imaginary
  tracks only), **Hard bot = real 2025 pole time**, sectors where they really are; car untouched.
- **Scale per circuit** is the lever for the lap time: our car is slower on straights and much
  faster in corners than an F1, so no single scale fits all; changing the car was ruled out
  (baseline v2 is the owner's reference).
- **Shape from OpenStreetMap, not OpenF1**: OpenF1 positions are map-matched onto one racing line
  (no width information at all, < 10 cm spread over ~1000 laps) whose chicanes are 8–10 m off the
  road; built on it, Monza's Roggia was a 200 km/h kink and the bots ran off. OSM's centreline,
  registered onto the OpenF1 lap, keeps the real corners; OpenF1 still gives times, sectors, speed.
- **Widths from published figures** (owner's choice when the data had none): each circuit's range,
  per section by real corner, × 1.6 for the game (one factor for all, not scaled with the lap).
- Corners too tight for our walls are opened only where the compiled track's walls really fold:
  a margin-based rule alone either left a fold or distorted the chicanes.
- Owner's feedback after driving Monza: real circuits get **only normal kerbs** (no yellow high
  kerbs that kick the car), **wider** (`kerbBand`, 1.5× the default band). The kerb band became a
  per-track value, defaulting to `TRACK_RULES`.
- The tool runs on plain Node (type stripping): `shared` became erasable-syntax only (one parameter
  property in `SegmentGrid`), which also suits the future Node server. `@types/node` added.

## 2026-10-23 — Real circuits' scenery from OpenStreetMap (step 9b.2, Monza)

- **OSM for the surroundings too**, through the same registration as the shape (`osmFrame`): real
  grandstands, pit lane, pit buildings, woods and Monza's old oval end up where they really are,
  with no hand-placed props, and the next circuits reuse the tool.
- **Positions relative to the wall** (`TrackSpot`), not absolute: the game's asphalt is 1.6× wider
  than the real one, so absolute positions would put stands on the run-off.
- **Pit lane decorative for now** (behind the wall): a drivable pit lane needs branches into the
  pits and rules for them; left for later.
- **Old oval as scenery only**: it is not a track of the game; on bridges where it crosses the GP
  track, removed where it shares the GP straights.
- **Wall styles by place** (concrete by stands and pits, tyres at gravel, armco elsewhere): what
  the real circuit looks like; the physics wall is unchanged.

## 2026-10-23 — Barcelona (step 9c)

- Same pipeline as Monza, no tool change: only the width marks were moved onto the real corners
  (Campsa; turn 13 and New Holland split) and the scale calibrated (0.915).
- **Sector tolerance per circuit** in the bot test: Barcelona's S1 (main straight + Renault) is 9%
  slower than reality because our car tops out ~80 km/h below an F1. The lap still matches the
  pole; the car is frozen, so the test allows 10% there instead of 7%.
- Scenery (9c.2): **Mediterranean look** and **GP circuit only** (karting, motocross and old chicane
  left out), owner's choices. Monza's theme logic moved into `realCircuitTheme.ts` so every real
  circuit shares it and only its look differs. The OSM tool became general: pit lane from several
  ways, footprint points located near their centre, footprints dropped where the wider game track
  leaves no room (Monza's output unchanged).

## 2026-10-23 — Baseline v3: faster car, real circuits recalibrated

- Owner's F2 change: `maxSpeed` 80 → 95 (top speed ~250 → ~283 km/h), frozen as baseline v3. The
  owner's idea: a faster car at the end of the straights makes braking and corner entry matter more.
- The Hard bot then lapped ~8% under the real poles; at the owner's request the GP circuits'
  scales were recalibrated (~+10%) to keep Hard = real pole. Tight corners stay hard (bigger
  braking, corner minimums +0–15 km/h): numbers in circuits.md. The scenery rule became "as far
  from every wall as from its own" (a Barcelona pit building came back too close at the new scale).

## 2026-10-23 — Monaco (step 9d)

- **Width × 1.2 for Monaco only** (owner's choice over × 1.6 and × 1.0): the real car-to-road ratio
  (4.4–6.5 cars side by side), so overtaking is as hard as in reality. × 1.6 made it easy;
  × 1.0 had the bots touching the walls. `WIDTH_FACTOR` stays the default (`widthFactor` per circuit).
- **Hairpins in the generator**: the Grand Hotel's legs are ~24 m apart and smoothing (how corners
  were opened) tightens a U-turn, so the limits never converged. Now opposite-facing neighbours
  are spread to 1.25 × both minimum radii (exactly 2 × leaves room only for a perfect semicircle,
  which smoothing can't reach); pushes stop within 1 cm (they approach their target geometrically
  and stalled 4·10⁻¹³ m short). Monza and Barcelona come out byte-identical.
- `lineDirection` was a placeholder (260): the first preview was upside down against the owner's
  PNG; 80 matches it.
- The Piscine entry got 12 m (the published maximum, an estimate): at 9–10 m the Hard and Medium
  bots ran wide on its exit; the bots are frozen, so the circuit's adaptation was the lever.

## 2026-10-23 — Monaco scenery, the town and the sea (step 9d.2a)

- **Town layers from OSM, opt-in per circuit** (`town`): Monaco's identity is its town, and OSM has
  it (heights included), so nothing is hand-placed but three grandstands (temporary, not in OSM;
  the owner wanted few). Monza and Barcelona stay byte-identical.
- **Buildings pushed out, not dropped**, when too close to the wall: dropping them emptied the
  streets; the street canyon is what Monaco looks like. Over the tunnel they stand on its roof.
- **The pit lane follows one stretch** and keeps only the run that fits: at Monaco it lies between
  the start straight and the Piscine, and the wider game track leaves no room for its entry from
  La Rascasse. The garages are generated (temporary boxes on the quay), never OSM's apartments.
- **Ground split into 50 m cells** (all tracks): a single huge quad hid Monaco's asphalt (depth
  precision); a latent bug that the other tracks hadn't shown yet.

## 2026-10-23 — Monaco's icons (step 9d.2b)

- **Landmarks by OSM name or POI**: OSM maps the Casino as a POI on an unnamed building, so a POI
  inside a footprint marks it; each landmark kind has its own small model on the real footprint.
- **Yachts generated, not from data**: OSM has the pontoons, not the boats; they're moored
  stern-to (as in Port Hercule) by a pure, tested rule, seeded so every load is the same.
- **Hills on the land side only**: Kruncar's mountain ring, on an arc away from the sea.

## 2026-10-26 — Look back and slipstream (step 10)

- **Look back is a view key** (Z, held, read every frame): it never enters `InputCommand`, so it
  costs nothing on the network later. The chase camera keeps smoothing behind the car while the
  view is flipped, so releasing Z never swings the camera round.
- **Slipstream = less drag + a small tow push.** The owner knew drag already existed but wanted the
  effect clearly felt: with thrust fading to 0 near `maxSpeed`, a drag cut alone gives only
  283 → ~305 km/h, so 1 m/s² of push on throttle brings it to the owner's 283 → 320 km/h (−45% drag).
- **Wake strength from the leader's speed**: the wake is made by the car ahead, so "proportional to
  speed" and "none below a minimum speed" are properties of the wake itself.
- **The factor lives in `CarState`**: it is computed in the deterministic sim, so the HUD % and the
  wind lines show exactly the same value, and the server will send it with the state.
- **Visuals chosen by the owner**: light wind lines on the screen edges (opacity ∝ tow, max 0.5 after the owner asked for more visible ones) and
  a SLIP bar + % in the HUD; no wake drawn behind the cars, no FOV kick.

## 2026-10-26 — Phase 2.1 plan: mode menu, nickname lobby, shared Test Ring

- **Split into sub-steps 2.1a–g** (rule 3): menu and separation first, then protocol, server
  lobby, client lobby, server room, online game, two-machine test.
- **Singleplayer and multiplayer fully separate** (owner's rule): own folders, dynamic imports
  per mode, an ESLint boundary between them, mode switches only through a reload.
- **Nicknames unique among connected players**, case-insensitive, freed on disconnect; no
  accounts yet. Same pure check on client (feedback) and server (authority).
- **One origin via Vite's `/ws` proxy**: no second port or URL to configure on other machines.
- **No client prediction in 2.1**: the simplest correct netcode first (server-authoritative,
  interpolated snapshots); prediction + reconciliation is 2.2, once two players can meet.
- **Server runs TypeScript directly** (Node type stripping + the existing extensionless-import
  loader, shared with the OpenF1 tool): no build step and no extra runtime dependency.

## 2026-10-26 — Multiplayer server, lobby and room (steps 2.1c–e)

- **`GameServer` has no sockets and no timers**: `main.ts` adapts `ws` and real time to it, so the
  whole lobby/room/message logic is tested with fake connections, and the server could later move
  to another transport untouched.
- **Ids never reused** (`p1`, `p2`, …): a late message from a player who left can't hit a newcomer.
  **Livery = lowest free index**, so colours stay few and stable.
- **`reset` latched until the next tick**: inputs and ticks don't line up one-to-one over a
  network, and a one-tick R press must neither vanish nor repeat.
- **Hello timeout (10 s) + ping heartbeat (5 s)**: sockets that never join, or laptops that drop
  off Tailscale without closing, can't keep a nickname or a car forever.
- **`welcome` carries the track name**: the client builds the room's track itself in 2.1f, and
  rooms on other tracks need no protocol change.
- **The loader moved to `01_tools/resolveTs.ts`**: the OpenF1 tool and the server both run
  TypeScript with plain Node; one copy for both.
- **Network-free screens**: `NicknameScreen` and `LobbyScreen` live in `view/menu` and only get
  callbacks and rows, so `view` stays free of either game mode (the ESLint boundary).

## 2026-10-26 — Online race (step 2.1f)

- **Straight onto the track** (owner): no lobby list after the nickname; the other players are seen
  on track with their nickname tags. `LobbyScreen` removed.
- **Snapshots played back 4 ticks (~67 ms) behind the newest**: two snapshot gaps at 30 Hz, so a
  single late packet never freezes the picture; the cost is ~67 ms of extra input delay until
  prediction (2.2). A render clock in server ticks, eased towards its target, snaps after big gaps.
- **No extrapolation**: when snapshots stop, cars hold still rather than guess (the disconnect
  menu follows if the socket closes).
- **Livery known before the car**: `players` precedes the first snapshot with a new car on the same
  ordered socket, so `SceneView` never has to recolour a car.

## 2026-10-26 — A room per circuit (step 2.1f+)

- **Owner's addition**: after the nickname the player picks Monza, Barcelona or Monaco; everyone on
  the same circuit drives together. The Test Ring is no longer offered online.
- **Rooms open on the first player and close on the last**: no idle simulations, and an empty
  circuit always restarts fresh. One `Room` per track, fully apart (state, players, snapshots).
- **Nicknames stay unique over the whole server**, not per room: one identity per player, and a
  later "switch circuit" needs no rename.
- **Protocol v2**: `welcome` lists the rooms (with player counts) instead of a track; `enter` /
  `entered` pick one. Old clients are rejected with `version`.

## 2026-10-28 — Online game modes (step 2.3 plan)

- **Three modes, chosen after the nickname** (owner): Free practice (today's room), Time trial,
  Grand Prix; each on Monza, Barcelona or Monaco. Rooms are keyed by mode + circuit.
- **Time trial alone** (owner): a private room per player, so no tow and no contact from anyone;
  the ghost is the session's best valid lap, recorded and drawn by the client only (view data).
- **Per-mode rules beside the simulation**: `Room` stays the authoritative simulation. Free
  practice has no rules of its own and a time trial is only a private room key (2.3c), so the one
  rules class is `server/src/GrandPrix.ts` (2.3e), flat beside `Lobby.ts` and `Room.ts`: no
  `modes/` folder or interface for a single implementation. The pure race rules (qualifying
  order, race standings, start hold) go in `shared/src/race/`.
- **GP manager** = the first player in; handed over to the longest-present player if they leave.
  Only the manager's GP commands are applied.
- **Qualifying = 3 timed laps each (Q1/Q2/Q3, no elimination)**: best valid lap counts; a tie goes
  to whoever set it first; no time → back of the grid. Reuses `LapState` unchanged.
- **Finished cars leave the track and their players spectate** (owner): nobody who is done can get
  in the way of a car still on a lap.
- **The manager can end qualifying or the race early** (owner): no timeouts; a disconnected
  player is DNF.
- **F1 lights start** (owner): five red lights a second apart, lights out after a random 0.2–1 s
  drawn by the server. Inputs before lights out are neutral on the server _and_ in the client's
  prediction (same shared function), so the start is predicted without a correction.
- **Closing a GP resets the circuit's room** and sends everyone back to the start through a page
  reload, like every mode change.
