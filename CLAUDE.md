# AltF1 Racing — Project Memory

Arcade F1-style racing game, Krunker.io-style pixel look (low-poly 3D + crisp nearest-filtered
textures), grip handling (no drift), first/third-person cameras, WASD controls.
Browser-first; must stay easy to wrap as a desktop app later. Multiplayer (client-server) comes later.
Repository: https://github.com/EneaFerri/altf1-racing (private, branch `main`).

## Working rules (top priority)

1. **Keep the repo clean.** Every file has an obvious home (see map below). No stray files, no dead code.
2. **Keep this file and `01_docs/` updated** with every meaningful change. When a topic grows, move it
   to its own `01_docs/*.md` and leave only a link here — this file is the index.
3. **Small steps.** One feature per step, then stop for the owner's review.
4. **Everything in English** (code, comments, docs).
5. **One circuit at a time.** While generating or changing a circuit, never touch any other
   circuit (its layout, theme, generated files or data), not even to regenerate it with a
   shared tool change, unless the owner explicitly says so. A shared change that would alter
   another circuit is kept from doing so (an option, a default that keeps the old behaviour), or
   left for the owner to decide. (Owner, 2026-11-17.)
6. **Naming:** project-owned top-level folders get a numeric prefix (`01_docs`, `01_packages`, `01_tools`) so they
   sort above generated stuff. `CLAUDE.md` and `README.md` keep their exact names (tools rely on them).

## Stack

TypeScript (strict) · Three.js · Vite · Vitest · ESLint + Prettier · npm workspaces.
Server: Node.js + `ws`. Rationale in [01_docs/decisions.md](01_docs/decisions.md).

## Repo map

- `01_packages/shared/src/sim/` — **Model** — `game.ts` (`GameState` with all cars + impacts + laps, `stepGame`, `SimContext` incl. per-car params and the rain's `weather`, `placeCar`/`removeCar`), `car.ts` (`stepCar`: brake pressure, grip, surfaces, spin, slope), `surface.ts` (wheel sampling + effects), `slipstream.ts` (tow from a car's wake), `laps.ts` (sector/lap timing), `damage.ts` (`CarDamage`, `stepDamage`, `damagedParams`: Grand Prix only), `pit.ts` (limiter, boxes, stops, a busy box skipped: Grand Prix only), `weather.ts` (`placePuddles`, `puddleShare`, `wetSurfaceEffect`: a wet track), `tyres.ts` (`TyreState`, `tyredParams`, `wearTyres`: soft and medium, Grand Prix only) _(Pure, one fixed tick. No `three`/DOM (ESLint). The server runs it too.)_
- `01_packages/shared/src/ai/` — **Bot** — `plan.ts` (`buildBotPlan`: racing line + speed profile, `botCarParams`), `driver.ts` (`botInput` → `InputCommand`, `BotMemory`; in traffic: following, passing, side by side), `pitPlan.ts` (`pitSchedule`, `pitDue`, `canSwitchPlan`: the bots' mandatory stops; the pit plan is `buildPitPlan`), `squad.ts` (`BotSquad`: single player's GP bots, plans and stops), `lapTime.ts` (`botLapTicks`: a class's flying lap, the bots' qualifying) _(Pure; see `01_docs/bot.md`)_
- `01_packages/shared/src/sim/collision/` — `resolve.ts` (`resolveCollisions`: pairs then walls), `walls.ts`, `cars.ts`, `collider.ts` (3 circles, `applyHit`, `kickSpin`), `types.ts` (`ImpactEvent`) _(See `01_docs/collisions.md`)_
- `01_packages/shared/src/track/` — `TrackDefinition` → `buildTrack()` → `Track` (+ `routes` for branches, `sectorStarts`, heights and grades when `elevated`: Monaco, São Paulo; `pitLane` on the real circuits, driven as one more route with `buildTrack(def, { pitLane: true })`: Grand Prix only, Phase 4); `query.ts` (`locateOnTrack`, `surfaceAt`, `gridSlot`); `layouts/` (`GP_TRACKS` in `index.ts`: the game's circuits, the real F1 ones, in every mode; their files are generated; `testTrack.ts`: the Test Ring, the tests' fixture only) _(See `01_docs/track.md`)_
- `01_packages/shared/src/config/` — `sim.ts` (`TICK_RATE`), `car.ts` (`CAR_PARAMS`, `CAR_WHEELS`), `surfaces.ts` (`SURFACE_PARAMS`), `track.ts` (`TRACK_RULES`), `collision.ts` (`COLLISION_PARAMS`, `CAR_COLLIDER`), `bot.ts` (`BOT_PARAMS`, `BOT_DRIVER`), `slipstream.ts` (`SLIPSTREAM_PARAMS`), `slope.ts` (`SLOPE_PARAMS`: elevated tracks only), `teams.ts` (`TEAMS`, `BOT_CLASS_COUNTS`: single player's GP teams and drivers), `grandPrix.ts` (`GRAND_PRIX`: qualifying laps, race distances 4/8/12 or 1–24 `isRaceLaps`, mandatory pit stops `pitRule`, F1 `points`, start lights), `damage.ts` (`DAMAGE_PARAMS`: Grand Prix only), `pit.ts` (`PIT_PARAMS`: stops), `tuning.ts` (`TUNING_BASELINE`: provisional/final), `weather.ts` (`Weather`, `RAIN_TRACKS`/`offersRain`, `WET_PARAMS`, `PUDDLE_PARAMS`), `tyres.ts` (`TYRE_PARAMS`: compounds' grip, traction, life) _(All tunable numbers live here; see `01_docs/tuning.md`)_
- `01_packages/shared/src/math/` — `vec2.ts`, `angle.ts`, `geometry.ts`, `spline.ts` (closed Catmull-Rom), `SegmentGrid.ts` (spatial grid)
- `01_packages/shared/src/net/` — **Multiplayer language** — `protocol.ts` (messages, `PROTOCOL_VERSION`, `ONLINE_MODES`, `MAX_PLAYERS`, `RECORD_MODES` and record boards, `parseClientMessage` validates untrusted input), `nickname.ts` (`checkNickname`, `nicknameKey`), `simContext.ts` (`onlineSimContext`: server and prediction run the same params, the GP's weather too), `quantize.ts` (`quantizeState`: snapshots rounded, the server's state too) _(Pure, shared by client and server; see `01_docs/multiplayer.md`)_
- `01_packages/shared/src/race/` — **Race rules** — `GrandPrix.ts` (`GrandPrix`: manager, weather, session best sectors, phases: qualifying, grid, start, race, results, play again; drivers with a given qualifying time, `addSimulated`; runs on any `GrandPrixRoom`: the server's `Room`, single player's `OfflineRoom.ts`), `qualifying.ts` (`qualifyingOrder`), `hold.ts` (`StartHold`, `heldInputs`, `startHold`, `lightsOn`: the F1 start, applied by server and prediction alike), `standings.ts` (`raceStandings`: order and gaps at the timing lines, pit penalties), `pitRule.ts` (`requiredStops`, `pitPenaltyTicks`: a stop every 4 laps, 25 s each one missing), `points.ts` (`racePoints`, `constructorStandings`: single player's GP), `teams.ts` (`teamLineup`: single player's GP seats, the bots' classes; `teamBoxes`, `squadBots`), `damage.ts` (`damageInPhase`: qualifying and race) _(Pure; see `01_docs/multiplayer.md`)_
- `01_packages/shared/src/types/` — `InputCommand`
- `01_packages/client/src/core/` — `GameLoop` (fixed-step accumulator), shared by both modes _(Only place using `requestAnimationFrame`)_
- `01_packages/client/src/singleplayer/` — **Single player** — `start.ts` (mode menu: Grand Prix / Time trial / Test → (GP: team) → track menu → (GP: weather) → race), `SinglePlayerGrandPrix` (the GP against 9 bots: `GrandPrix` on an `OfflineRoom`, `BotSquad`, panel, lights, results), `SinglePlayerGame` (Time trial and Test: wires M-V-C, builds the track, keeps prev/curr state, owns live params; in Test the bot: B), `ghost.ts` (time trial's ghost), `localRecords.ts` (time trial's best lap per circuit, `localStorage`) _(Never imports `multiplayer/` (ESLint); see `01_docs/multiplayer.md`)_
- `01_packages/client/src/multiplayer/` — **Multiplayer** — `start.ts` (nickname → join → mode: Free practice / Grand Prix → track → race), `OnlineGame` (sends numbered inputs, draws the predicted room), `Predictor` (client-side prediction + corrections, the other cars' scaled to their speed), `OnlineGrandPrix` (GP panel, lights, manager keys, spectating, results), `recordsText.ts` (lap-record rows), `NetClient` (typed WebSocket), `serverUrl.ts`, `lobbyText.ts` (texts, mode menu rows) _(Never imports `singleplayer/` (ESLint); see `01_docs/multiplayer.md`)_
- `01_packages/client/src/race/` — **Grand Prix texts, both modes** — `grandPrixText.ts` (GP panel texts, `DriverLook`: how a driver is shown), `resultsText.ts` (podium and classification texts), `customLaps.ts` (the grid's own race distance) _(Imports neither mode (ESLint))_
- `01_packages/client/src/controller/` — **Controller** — `bindings.ts` (drive keys, view keys, tick triggers, actions), `KeyboardController` _(Uses `KeyboardEvent.code` (layout-independent))_
- `01_packages/client/src/view/` — **View** — `SceneView` (scene, one `CarView` per car id with its livery, interpolation), `TrackView` (meshes from `Track` + theme), `ribbon.ts` (strip geometry), `CarView` (also see-through, for the ghost; height and pitch on an elevated track; red rear lights in night races and the rain; wet tyres in the rain), `CockpitView` (first-person wheel), `FlagMarshal` + `flagMarshalArt.ts` (the GP's chequered flag at the line), `carDamageLook.ts` (how damage looks: bent or missing wings, flat tyres), `WindLines` (slipstream streaks), `NameTag` (online nicknames), pixel textures + liveries (team colours `TEAM_LIVERIES`, stripe and sponsor), renderer _(Reads state, never writes it)_
- `01_packages/client/src/view/weather/` — `look.ts` (`rainLook`: the rain's look from any theme), `puddles.ts` (the puddles' mesh), `Raindrops.ts` (light falling rain moved in the vertex shader, `RAINDROP_PARAMS`; N switches it) _(Applied live by `SceneView.setWeather`; see `01_docs/weather.md`)_
- `01_packages/client/src/view/cameras/` — `CameraRig` (V toggle, Z look back, speed FOV), `ChaseCamera`, `FirstPersonCamera`, `params.ts` (`CAMERA_PARAMS`)
- `01_packages/client/src/view/hud/` — `Hud` + `hud.css` (F1-style timing strip; in the Grand Prix a sector table: this lap and own bests, purple = session best of all), `format.ts` (times, deltas, sector colours), `DebugOverlay` (F3: telemetry, last impact, damage), `DamagePanel` (bottom right, Grand Prix damage), `Minimap` + `minimapFit.ts` (bottom-left track map, dots and legend), `GrandPrixPanel` (top-left, online GP; purple stopwatch on the fastest lap), `StartLights` (F1 start gantry), `ResultsScreen` + `results.css` + `pixelFigure.ts` (GP podium, classification card (single player: TEAM and PTS) and constructors' card)
- `01_packages/client/src/dev/` — Dev-only tools: `TuningPanel` (lil-gui, F2 in single player's Test: car, collision, camera, surface + bot params; damage on/off and params; rain on/off, wet params and the falling rain's look); the dummy car (F4) is wired in `singleplayer/SinglePlayerGame.ts` _(Dynamically imported under `import.meta.env.DEV`; absent from production builds)_
- `01_packages/client/src/view/themes/` — `theme.ts` (`TrackTheme`, `loadTheme`: one chunk per theme, loaded when the track is chosen), `realCircuitTheme.ts` (shared by real circuits), `monza.ts`/`barcelona.ts`/`monaco.ts`/`mexico.ts`/`singapore.ts`/`lasVegas.ts`/`saoPaulo.ts` + `<id>Layout.ts`, generated `monacoLand.ts`/`saoPauloLand.ts` (the real land of the elevated circuits, Phase 3) (looks; layouts generated from OSM) _(See `01_docs/themes.md`)_
- `01_packages/client/src/view/scenery/` — `placement.ts` (pure: clearance, scatter, track-relative spots, stands in pieces along bends, a stadium's bowl, moored boats, floodlight spots; tested), `ground.ts` (pure: the ground's height round an elevated track, on the real land, settled under the road; lakes at their own level), `onGround.ts` (props stood on it), `nature.ts` (incl. pines, volcanoes), `buildings.ts`, `realCircuit.ts` (pit lane, old oval), `town.ts` (city, sea, piers, pools, palms), `tunnel.ts`, `landmarks.ts` (Casino, chapel, domes, Singapore Flyer, SkyPark, durians, Sphere, Eiffel Tower, Bellagio fountains, Stratosphere), `night.ts` (night races: floodlights, stars), `yachts.ts`, `stadium.ts` (stadium bowls: Mexico City's Foro Sol and ballpark) _(See `01_docs/themes.md`)_
- `01_packages/client/src/view/menu/` — `ListMenu` (every list menu: mouse, W/S + Enter; optional `content`, live `setItem`), `ModeMenu` (start: Singleplayer / Multiplayer), `TrackMenu` (single player's track), `NicknameScreen` (multiplayer, network-free), `RecordTable` (lap-record board), `dom.ts`, `menu.css` _(See `01_docs/architecture.md`, `01_docs/multiplayer.md`)_
- `01_packages/client/src/main.ts` — Bootstrap only: `ModeMenu` → dynamic import of the chosen mode
- `01_packages/server/` — **Multiplayer server** (Node + `ws`, TS run directly via `01_tools/resolveTs.ts`) — `Lobby` (nicknames, ids, liveries), `Room` (one circuit's authoritative race, input timeline with jitter buffer, damage on/off; a `GrandPrixRoom`), `GameServer` (with a shared `GrandPrix` per GP room) (rooms per mode and circuit of `GP_TRACKS`; messages; socket-free), `LapRecords` (lap records in SQLite, `node:sqlite`), `main.ts` (ws adapter with compression, timeouts, heartbeat, opens `data/records.db`), `netSim.ts` (dev: simulated bad network, `NET_DELAY_MS`…) _(`npm run server`; see `01_docs/multiplayer.md`)_
- `01_tools/openf1/` — Real-circuit tool (plain Node): OpenF1 + OpenStreetMap data in `data/` → generated `layouts/<id>.ts`; `circuits.ts` holds widths and adaptation; `calibrate.ts` fits the scale to the real pole; `pitLane.ts` (+ `locate.ts`) the real pit lane into the layout (Phase 4); `scenery.ts` → generated `themes/<id>Layout.ts`; `terrain.ts` + `elevation.ts`: land heights (EU-DEM; SRTM outside Europe) and the track's elevation (Phase 3) _(See its `README.md` and `01_docs/circuits.md`)_
- `01_tools/swiftExport/` — `export.ts`: the circuits' definitions, scenery and land → JSON for the macOS app; `fixtures.ts`: the TypeScript model's results for the Swift parity tests (both read only) _(See `01_docs/macos.md`)_
- `01_tools/resolveTs.ts` — Node loader: lets plain `node` run TypeScript importing `shared` (extensionless imports) _(Used by the OpenF1 tool, the Swift export and the server)_
- `04_macos/` — **macOS app** (Swift, Phase X) — `AltF1.xcodeproj` (folder-synced), `AltF1Info.plist` (App Transport Security off: the server's plain ws://), `AltF1/` (app: SwiftUI + RealityKit: `App/`, `UI/` (Liquid Glass menus), `Input/` (keyboard), `Modes/` (`GameLoop`, `RaceSession`, `DriveSession`, `RaceScreen`, `GrandPrixSession`, `GrandPrixScreen`, `OnlineSession` + `OnlineScreen` (the online race), `Ghost`, `LocalRecords`), `UI/HUD/` (timing strip, minimap, F3 telemetry), `UI/GrandPrix/` (GP panel, lights, damage, results), `UI/Online/` (nickname and server address, record board), `Net/` (`NetClient`: the multiplayer socket, `Lobby`, `LobbyText`), `Render/` (ARView scene, track meshes with the pit lane and wall styles, the lofted PBR car with liveries, its damage (`CarDamageLook`) and flying `Debris`, cameras, procedural PBR textures, day and night skies), `Render/Scenery/` (each circuit's look and scenery: town, sea, yachts, landmarks, night lights), `Dev/` (Debug: autostart, autopilot, snapshots)), `AltF1Core/` (Swift package, optimised in Debug too: the model, a 1:1 port of `shared`: `Math/`, `Config/`, `Types/`, `Track/` (`buildTrack`, queries, `CircuitCatalog`), `Sim/` (`stepGame` and all of `sim/`, `Collision/`), `AI/` (bots), `Race/` (the Grand Prix engine, `OfflineRoom`), `Net/` (the protocol, nicknames, `ServerAddress`, `Predictor`), `Scenery/` (placement, real land, triangulation); `Resources/Circuits/` generated; tests check parity with the TypeScript, bit-identical tracks, 1 ulp per tick) _(See `01_docs/macos.md`)_
- `01_docs/` — Topic docs _(See index below)_
- `03_F1Circuits/` — Owner's reference PNGs of the real circuits (shape and orientation of the layouts) _(See `01_docs/circuits.md`)_

Tests live next to the file they test (`*.test.ts`). Unused params must be prefixed with `_`.

## Commands

```
npm install        # once
npm run dev        # dev server (also reachable on LAN/Tailscale)
npm test           # Vitest
npm run typecheck  # tsc in every package, 01_tools/openf1 and 01_tools/swiftExport
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # production build of the client
npm run server     # multiplayer server (port 8787, restarts on save); the client reaches it via Vite's /ws proxy
node --import ./01_tools/resolveTs.ts 01_tools/swiftExport/export.ts   # circuits → the macOS app's JSON
node --import ./01_tools/resolveTs.ts 01_tools/swiftExport/fixtures.ts # the macOS app's parity fixtures
cd 04_macos/AltF1Core && swift test                                    # the macOS app's model tests
xcodebuild -project 04_macos/AltF1.xcodeproj -scheme AltF1 build       # the macOS app
```

## Generated and local files (never edit, all git-ignored except the lockfile)

- `node_modules/` — installed libraries. Only one, at the root; Vite's cache lives in
  `node_modules/.vite` (`cacheDir` in `01_packages/client/vite.config.ts`). No package may get its own.
- `01_packages/*/dist/` — output of `npm run build`; safe to delete anytime.
- `package-lock.json` — exact dependency versions. **Committed**, never hand-edited.
- `.DS_Store` — macOS Finder metadata.
- `01_tools/openf1/preview/` — layout and elevation previews written by the real-circuit tool.
- `01_packages/server/data/` — the server's lap records (`records.db`, SQLite); delete to reset them.
- `04_macos/AltF1Core/.build/`, `.swiftpm/`, `xcuserdata/`, `DerivedData/` — Swift/Xcode build output and per-user state.
- `04_macos/AltF1Core/Sources/AltF1Core/Resources/Circuits/*.json` and `04_macos/AltF1Core/Tests/AltF1CoreTests/Fixtures/*.json` — **committed** but generated by `01_tools/swiftExport` (`export.ts`, `fixtures.ts`): never hand-edited.
- `02_screen_krunkerMap/` — local reference screenshots of the Krunker map the removed Kruncar track was based on (owner's, ~22 MB).

`.vscode/settings.json` hides `node_modules`, `dist` and `.DS_Store` from the VS Code file tree.

## Docs index

- [01_docs/architecture.md](01_docs/architecture.md) — MVC split, game loop, data flow
- [01_docs/track.md](01_docs/track.md) — track format & compilation, kerb/gravel rules, surfaces & grip, test track layout
- [01_docs/themes.md](01_docs/themes.md) — track looks: theme system, the real circuits' looks, OSM scenery of real circuits, placement rules
- [01_docs/circuits.md](01_docs/circuits.md) — real circuits: OpenF1 + OSM pipeline, widths, scale vs real pole time, results
- [01_docs/laps.md](01_docs/laps.md) — free-practice timing, sectors/checkpoints, validity, HUD
- [01_docs/collisions.md](01_docs/collisions.md) — walls, car-vs-car, solver, impact events, parameters, measured behaviour
- [01_docs/physics.md](01_docs/physics.md) — car model (grip, brake pressure), conventions (units, axes, heading), parameters, measured behaviour
- [01_docs/bot.md](01_docs/bot.md) — bot opponent: levels, racing line, speed profile, measured lap times
- [01_docs/tuning.md](01_docs/tuning.md) — tuning baseline (v3 final, the reference setup), status flag, re-tune workflow
- [01_docs/multiplayer.md](01_docs/multiplayer.md) — Phase 2: mode menu, singleplayer/multiplayer separation, lobby and nicknames, protocol, server room, dev setup
- [01_docs/elevation.md](01_docs/elevation.md) — Phase 3: elevation on Monaco (data, slope force, terrain, online)
- [01_docs/damage.md](01_docs/damage.md) — Phase 4: car damage (Grand Prix only): parts, impacts, off track, effects
- [01_docs/pitlane.md](01_docs/pitlane.md) — Phase 4: the real pit lanes (Grand Prix only): data, method, results
- [01_docs/weather.md](01_docs/weather.md) — 2.7: rain (puddles, wet look, wet physics, online)
- [01_docs/tyres.md](01_docs/tyres.md) — T.1: soft and medium tyres (Grand Prix only): wear, stops, bots, online
- [01_docs/macos.md](01_docs/macos.md) — Phase X: the native macOS app in Swift (layout, circuit JSON, conventions)
- [01_docs/roadmap.md](01_docs/roadmap.md) — phases and current status
- [01_docs/decisions.md](01_docs/decisions.md) — decision log (why we chose what we chose)

## Current status

- Phase 1 (single player, five tracks, bot): done.
- Phase 2 (multiplayer): lobby (2.1), client-side prediction and minimap (2.2), the online modes
  Free practice, Time trial with ghost (moved to single player in M.3) and the full Grand Prix incl. the chequered flag (2.3a–k),
  Mexico City (2.4a) and server lap records in SQLite (2.5a) done. More circuits (2.4) whenever
  the owner wants one. Protocol v18. **Next circuits** (plan in the roadmap): 2.4b one Monaco
  (with its heights) done; 2.4c Singapore (night race, town, landmarks) done; 2.4d Las Vegas (night race, the Strip, landmarks) done; 2.4e São Paulo
  (with heights): circuit, heights, pit lane and scenery (e.1–e.3) done, awaiting the owner's test. **2.6 in progress** (netcode on weak
  connections): 2.6a input timeline with jitter buffer, 2.6b lighter snapshots (rounding +
  compression) and 2.6c smoother opponents done; awaiting the owner's test over Tailscale.
  **2.7 in progress** (rain, chosen by the GP manager; São Paulo first): W.1 wet look
  (dev only, rear lights) done; W.2 wet physics (dev only, the owner's numbers) done; W.2b wet tyres and falling rain (N, the owner's look) done; W.3 rain in the online GP
  (protocol v15) done, awaiting the owner's test; next W.4 spray. 2.3l Grand Prix sector table
  (F1 colours, session bests from the server) done, awaiting the owner's test.
- Phase 3 (elevation on Monaco, online in every mode): done.
- Phase 4 (pit lane and car damage, Grand Prix only): 4a–4h done; **4i in progress**: the
  owner's test over Tailscale and tuning (cars made sturdier on 2026-11-04); P.1 solid pit wall
  (walls catch only from the front) and P.2 São Paulo's pit lane (gentle heights, boxes by the
  line, 240 m limiter, no grass) done, awaiting the owner's test.

- **M (menus and GP rules, owner 2026-11-19) in progress**: M.1 only the F1 circuits (Kruncar
  removed, Test Ring a test fixture), M.2 the singleplayer menu (Free practice, Time trial with
  local records, Test), M.3 multiplayer = Free practice + Grand Prix (protocol v16), M.4 custom
  GP laps (1–24, protocol v17) and M.5 mandatory pit stops (one per 4 laps, at most 4, 25 s each
  one missing) done, awaiting the owner's review.
- **S (single-player GP against 9 bots, owner 2026-11-19) in progress**: S.1 teams, drivers and
  liveries, S.2 bots in traffic and S.3 bots that pit, S.4 one GP engine for both modes and S.5 the single-player GP (Free practice
  replaced) and S.6 points and constructors done, awaiting the owner's review.

- **X (native macOS app in Swift, owner 2026-11-22) in progress**: RealityKit with a realistic PBR
  look, Liquid Glass UI, every feature, online on the same server. X.0 scaffolding (Xcode project,
  `AltF1Core` package, circuit JSON export, start menus) X.1 the model's port (track, sim,
  collisions, damage, pit, rain; parity tests against the TypeScript) and X.2 the first drivable lap
  (Test on any circuit: PBR track and car, sky, sun and shadows, chase and a real onboard view
  through the halo) and X.3 HUD and Time trial (timing strip, minimap, F3, ghost, local records), the
  car rebuilt after the owner's photos (lofted body, open cockpit with the driver) and X.4 bots and
  the single-player Grand Prix (parity tests, team liveries, the whole GP) done, awaiting the owner's
  review; X.5 scenery: a Monaco and b Singapore (night race) done, awaiting the owner's review; next
  the other circuits, one at a time. X.7 online (the web's server, Mac and browser together):
  X.7a protocol and socket, X.7b the lobby menus, X.7c online Free practice and X.7d the online
  Grand Prix done, awaiting the owner's test with friends (setup in the README). C.1 a more realistic car with its damage drawn and debris flying off done,
  awaiting the owner's review.
- **T.1 (tyres, owner 2026-11-23) done, awaiting the owner's test**: soft (red) or medium (yellow)
  at a stop (keys 1 / 2), wear, bots by their stint; web and Mac, online (protocol v18).

Step by step history: [01_docs/roadmap.md](01_docs/roadmap.md).
