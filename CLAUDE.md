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
5. **Naming:** project-owned top-level folders get a numeric prefix (`01_docs`, `01_packages`, `01_tools`) so they
   sort above generated stuff. `CLAUDE.md` and `README.md` keep their exact names (tools rely on them).

## Stack

TypeScript (strict) · Three.js · Vite · Vitest · ESLint + Prettier · npm workspaces.
Future server: Node.js + `ws`. Rationale in [01_docs/decisions.md](01_docs/decisions.md).

## Repo map

| Path                                    | Role                                                                                                                                                                                                                                                                                                                                                                                                                  | Notes                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `01_packages/shared/src/sim/`           | **Model** — `game.ts` (`GameState` with all cars + impacts + laps, `stepGame`, `SimContext` incl. per-car params, `placeCar`/`removeCar`), `car.ts` (`stepCar`: brake pressure, grip, surfaces, spin), `surface.ts` (wheel sampling + effects), `slipstream.ts` (tow from a car's wake), `laps.ts` (sector/lap timing)                                                                                                | Pure, one fixed tick. No `three`/DOM (ESLint). Server will reuse it.            |
| `01_packages/shared/src/ai/`            | **Bot** — `plan.ts` (`buildBotPlan`: racing line + speed profile, `botCarParams`), `driver.ts` (`botInput` → `InputCommand`, `BotMemory`)                                                                                                                                                                                                                                                                             | Pure; see `01_docs/bot.md`                                                      |
| `01_packages/shared/src/sim/collision/` | `resolve.ts` (`resolveCollisions`: pairs then walls), `walls.ts`, `cars.ts`, `collider.ts` (3 circles, `applyHit`, `kickSpin`), `types.ts` (`ImpactEvent`)                                                                                                                                                                                                                                                            | See `01_docs/collisions.md`                                                     |
| `01_packages/shared/src/track/`         | `TrackDefinition` → `buildTrack()` → `Track` (+ `routes` for branches, `sectorStarts`); `query.ts` (`locateOnTrack`, `surfaceAt`, `gridSlot`); `layouts/` (`TRACKS` in `index.ts`; `monza.ts` is generated)                                                                                                                                                                                                           | See `01_docs/track.md`                                                          |
| `01_packages/shared/src/config/`        | `sim.ts` (`TICK_RATE`), `car.ts` (`CAR_PARAMS`, `CAR_WHEELS`), `surfaces.ts` (`SURFACE_PARAMS`), `track.ts` (`TRACK_RULES`), `collision.ts` (`COLLISION_PARAMS`, `CAR_COLLIDER`), `bot.ts` (`BOT_PARAMS`, `BOT_DRIVER`), `slipstream.ts` (`SLIPSTREAM_PARAMS`), `grandPrix.ts` (`GRAND_PRIX`: qualifying laps, race distances, start lights), `tuning.ts` (`TUNING_BASELINE`: provisional/final)                      | All tunable numbers live here; see `01_docs/tuning.md`                          |
| `01_packages/shared/src/math/`          | `vec2.ts`, `angle.ts`, `geometry.ts`, `spline.ts` (closed Catmull-Rom), `SegmentGrid.ts` (spatial grid)                                                                                                                                                                                                                                                                                                               |                                                                                 |
| `01_packages/shared/src/net/`           | **Multiplayer language** — `protocol.ts` (messages, `PROTOCOL_VERSION`, `ONLINE_MODES`, `MAX_PLAYERS`, `parseClientMessage` validates untrusted input), `nickname.ts` (`checkNickname`, `nicknameKey`), `simContext.ts` (`onlineSimContext`: server and prediction run the same params)                                                                                                                               | Pure, shared by client and server; see `01_docs/multiplayer.md`                 |
| `01_packages/shared/src/race/`          | **Race rules** — `qualifying.ts` (`qualifyingOrder`), `hold.ts` (`StartHold`, `heldInputs`, `startHold`, `lightsOn`: the F1 start, applied by server and prediction alike)                                                                                                                                                                                                                                            | Pure; see `01_docs/multiplayer.md`                                              |
| `01_packages/shared/src/types/`         | `InputCommand`                                                                                                                                                                                                                                                                                                                                                                                                        |                                                                                 |
| `01_packages/client/src/core/`          | `GameLoop` (fixed-step accumulator), shared by both modes                                                                                                                                                                                                                                                                                                                                                             | Only place using `requestAnimationFrame`                                        |
| `01_packages/client/src/singleplayer/`  | **Single player** — `start.ts` (track menu → race), `SinglePlayerGame` (wires M-V-C, builds the track, keeps prev/curr state, owns live params, drives the bot: B)                                                                                                                                                                                                                                                    | Never imports `multiplayer/` (ESLint); see `01_docs/multiplayer.md`             |
| `01_packages/client/src/multiplayer/`   | **Multiplayer** — `start.ts` (nickname → join → mode → track → race), `OnlineGame` (sends numbered inputs, draws the predicted room), `Predictor` (client-side prediction + corrections), `ghost.ts` (time trial's ghost), `OnlineGrandPrix` (GP panel, lights, manager keys, spectating), `grandPrixText.ts` (GP panel texts), `NetClient` (typed WebSocket), `serverUrl.ts`, `lobbyText.ts` (texts, mode menu rows) | Never imports `singleplayer/` (ESLint); see `01_docs/multiplayer.md`            |
| `01_packages/client/src/controller/`    | **Controller** — `bindings.ts` (drive keys, view keys, tick triggers, actions), `KeyboardController`                                                                                                                                                                                                                                                                                                                  | Uses `KeyboardEvent.code` (layout-independent)                                  |
| `01_packages/client/src/view/`          | **View** — `SceneView` (scene, one `CarView` per car id with its livery, interpolation), `TrackView` (meshes from `Track` + theme), `ribbon.ts` (strip geometry), `CarView` (also see-through, for the ghost), `CockpitView` (first-person wheel), `WindLines` (slipstream streaks), `NameTag` (online nicknames), pixel textures + liveries, renderer                                                                | Reads state, never writes it                                                    |
| `01_packages/client/src/view/cameras/`  | `CameraRig` (V toggle, Z look back, speed FOV), `ChaseCamera`, `FirstPersonCamera`, `params.ts` (`CAMERA_PARAMS`)                                                                                                                                                                                                                                                                                                     |                                                                                 |
| `01_packages/client/src/view/hud/`      | `Hud` + `hud.css` (F1-style timing strip), `format.ts` (times, deltas, sector colours), `DebugOverlay` (F3: telemetry, last impact), `Minimap` + `minimapFit.ts` (bottom-left track map, dots and legend), `GrandPrixPanel` (top-left, online GP), `StartLights` (F1 start gantry)                                                                                                                                    |                                                                                 |
| `01_packages/client/src/dev/`           | Dev-only tools: `TuningPanel` (lil-gui, F2: car, collision, camera, surface + bot params); the dummy car (F4) is wired in `singleplayer/SinglePlayerGame.ts`                                                                                                                                                                                                                                                          | Dynamically imported under `import.meta.env.DEV`; absent from production builds |
| `01_packages/client/src/view/themes/`   | `theme.ts` (`TrackTheme`, `themeFor`), `classic.ts` (Test Ring look), `kruncar.ts` + `kruncarLayout.ts` (Kruncar look, prop positions), `realCircuitTheme.ts` (shared by real circuits), `monza.ts`/`barcelona.ts`/`monaco.ts` + `<id>Layout.ts` (looks; layouts generated from OSM)                                                                                                                                  | See `01_docs/themes.md`                                                         |
| `01_packages/client/src/view/scenery/`  | `placement.ts` (pure: clearance, scatter, apexes, track-relative spots, stands in pieces along bends, moored boats; tested), `nature.ts` (incl. pines), `buildings.ts`, `trackside.ts`, `realCircuit.ts` (pit lane, old oval), `town.ts` (city, sea, piers, pools, palms), `tunnel.ts`, `landmarks.ts` (Casino, chapel), `yachts.ts`                                                                                  | See `01_docs/themes.md`                                                         |
| `01_packages/client/src/view/menu/`     | `ListMenu` (every list menu: mouse, W/S + Enter), `ModeMenu` (start: Singleplayer / Multiplayer), `TrackMenu` (single player's track), `NicknameScreen` (multiplayer, network-free), `dom.ts`, `menu.css`                                                                                                                                                                                                             | See `01_docs/architecture.md`, `01_docs/multiplayer.md`                         |
| `01_packages/client/src/main.ts`        | Bootstrap only: `ModeMenu` → dynamic import of the chosen mode                                                                                                                                                                                                                                                                                                                                                        |                                                                                 |
| `01_packages/server/`                   | **Multiplayer server** (Node + `ws`, TS run directly via `01_tools/resolveTs.ts`) — `Lobby` (nicknames, ids, liveries), `Room` (one circuit's authoritative race), `GrandPrix` (manager, phases: qualifying, grid, start), `GameServer` (rooms per mode and circuit: Monza, Barcelona, Monaco; messages; socket-free), `main.ts` (ws adapter, timeouts, heartbeat)                                                    | `npm run server`; see `01_docs/multiplayer.md`                                  |
| `01_tools/openf1/`                      | Real-circuit tool (plain Node): OpenF1 + OpenStreetMap data in `data/` → generated `layouts/<id>.ts`; `circuits.ts` holds widths and adaptation; `calibrate.ts` fits the scale to the real pole; `scenery.ts` → generated `themes/<id>Layout.ts`                                                                                                                                                                      | See its `README.md` and `01_docs/circuits.md`                                   |
| `01_tools/resolveTs.ts`                 | Node loader: lets plain `node` run TypeScript importing `shared` (extensionless imports)                                                                                                                                                                                                                                                                                                                              | Used by the OpenF1 tool and the server                                          |
| `01_docs/`                              | Topic docs                                                                                                                                                                                                                                                                                                                                                                                                            | See index below                                                                 |
| `03_F1Circuits/`                        | Owner's reference PNGs of the real circuits (shape and orientation of the layouts)                                                                                                                                                                                                                                                                                                                                    | See `01_docs/circuits.md`                                                       |

Tests live next to the file they test (`*.test.ts`). Unused params must be prefixed with `_`.

## Commands

```
npm install        # once
npm run dev        # dev server (also reachable on LAN/Tailscale)
npm test           # Vitest
npm run typecheck  # tsc in every package and 01_tools/openf1
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # production build of the client
npm run server     # multiplayer server (port 8787, restarts on save); the client reaches it via Vite's /ws proxy
```

## Generated and local files (never edit, all git-ignored except the lockfile)

- `node_modules/` — installed libraries. Only one, at the root; Vite's cache lives in
  `node_modules/.vite` (`cacheDir` in `01_packages/client/vite.config.ts`). No package may get its own.
- `01_packages/*/dist/` — output of `npm run build`; safe to delete anytime.
- `package-lock.json` — exact dependency versions. **Committed**, never hand-edited.
- `.DS_Store` — macOS Finder metadata.
- `01_tools/openf1/preview/` — layout previews written by the real-circuit tool.
- `02_screen_krunkerMap/` — local reference screenshots of the Krunker map Kruncar is based on (owner's, ~22 MB).

`.vscode/settings.json` hides `node_modules`, `dist` and `.DS_Store` from the VS Code file tree.

## Docs index

- [01_docs/architecture.md](01_docs/architecture.md) — MVC split, game loop, data flow
- [01_docs/track.md](01_docs/track.md) — track format & compilation, kerb/gravel rules, surfaces & grip, test track layout
- [01_docs/themes.md](01_docs/themes.md) — track looks: theme system, Kruncar, Monza, Barcelona and Monaco looks, OSM scenery of real circuits, placement rules
- [01_docs/circuits.md](01_docs/circuits.md) — real circuits: OpenF1 + OSM pipeline, widths, scale vs real pole time, results
- [01_docs/laps.md](01_docs/laps.md) — free-practice timing, sectors/checkpoints, validity, HUD
- [01_docs/collisions.md](01_docs/collisions.md) — walls, car-vs-car, solver, impact events, parameters, measured behaviour
- [01_docs/physics.md](01_docs/physics.md) — car model (grip, brake pressure), conventions (units, axes, heading), parameters, measured behaviour
- [01_docs/bot.md](01_docs/bot.md) — bot opponent: levels, racing line, speed profile, measured lap times
- [01_docs/tuning.md](01_docs/tuning.md) — tuning baseline (v3 final, the reference setup), status flag, re-tune workflow
- [01_docs/multiplayer.md](01_docs/multiplayer.md) — Phase 2: mode menu, singleplayer/multiplayer separation, lobby and nicknames, protocol, server room, dev setup
- [01_docs/roadmap.md](01_docs/roadmap.md) — phases and current status
- [01_docs/decisions.md](01_docs/decisions.md) — decision log (why we chose what we chose)

## Current status

Phase 1 (single player, five tracks, bot) done. Phase 2 (multiplayer) in progress: 2.1 lobby with
nicknames and a room per circuit, 2.2 client-side prediction (protocol v4) and the minimap (2.2+)
are done and tested over Tailscale. Next: 2.3, online game modes (Free practice, Time trial with
ghost, Grand Prix with qualifying and race), planned in ten sub-steps 2.3a–j. Step by step history: [01_docs/roadmap.md](01_docs/roadmap.md).
