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

| Path                                    | Role                                                                                                                                                                                                                                                                          | Notes                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `01_packages/shared/src/sim/`           | **Model** — `game.ts` (`GameState` with all cars + impacts + laps, `stepGame`, `SimContext` incl. per-car params, `placeCar`/`removeCar`), `car.ts` (`stepCar`: brake pressure, grip, surfaces, spin), `surface.ts` (wheel sampling + effects), `laps.ts` (sector/lap timing) | Pure, one fixed tick. No `three`/DOM (ESLint). Server will reuse it.            |
| `01_packages/shared/src/ai/`            | **Bot** — `plan.ts` (`buildBotPlan`: racing line + speed profile, `botCarParams`), `driver.ts` (`botInput` → `InputCommand`, `BotMemory`)                                                                                                                                     | Pure; see `01_docs/bot.md`                                                      |
| `01_packages/shared/src/sim/collision/` | `resolve.ts` (`resolveCollisions`: pairs then walls), `walls.ts`, `cars.ts`, `collider.ts` (3 circles, `applyHit`, `kickSpin`), `types.ts` (`ImpactEvent`)                                                                                                                    | See `01_docs/collisions.md`                                                     |
| `01_packages/shared/src/track/`         | `TrackDefinition` → `buildTrack()` → `Track` (+ `routes` for branches, `sectorStarts`); `query.ts` (`locateOnTrack`, `surfaceAt`, `gridSlot`); `layouts/` (`TRACKS` in `index.ts`; `monza.ts` is generated)                                                                   | See `01_docs/track.md`                                                          |
| `01_packages/shared/src/config/`        | `sim.ts` (`TICK_RATE`), `car.ts` (`CAR_PARAMS`, `CAR_WHEELS`), `surfaces.ts` (`SURFACE_PARAMS`), `track.ts` (`TRACK_RULES`), `collision.ts` (`COLLISION_PARAMS`, `CAR_COLLIDER`), `bot.ts` (`BOT_PARAMS`, `BOT_DRIVER`), `tuning.ts` (`TUNING_BASELINE`: provisional/final)   | All tunable numbers live here; see `01_docs/tuning.md`                          |
| `01_packages/shared/src/math/`          | `vec2.ts`, `angle.ts`, `geometry.ts`, `spline.ts` (closed Catmull-Rom), `SegmentGrid.ts` (spatial grid)                                                                                                                                                                       |                                                                                 |
| `01_packages/shared/src/types/`         | `InputCommand`                                                                                                                                                                                                                                                                |                                                                                 |
| `01_packages/client/src/core/`          | `GameLoop` (fixed-step accumulator), `Game` (wires M-V-C, builds the track, keeps prev/curr state, owns live params, drives the bot: B)                                                                                                                                       | Only place using `requestAnimationFrame`                                        |
| `01_packages/client/src/controller/`    | **Controller** — `bindings.ts` (drive keys, tick triggers, actions), `KeyboardController`                                                                                                                                                                                     | Uses `KeyboardEvent.code` (layout-independent)                                  |
| `01_packages/client/src/view/`          | **View** — `SceneView` (scene, one `CarView` per car id with its livery, interpolation), `TrackView` (meshes from `Track` + theme), `ribbon.ts` (strip geometry), `CarView`, `CockpitView` (first-person wheel), pixel textures, renderer                                     | Reads state, never writes it                                                    |
| `01_packages/client/src/view/cameras/`  | `CameraRig` (V toggle, speed FOV), `ChaseCamera`, `FirstPersonCamera`, `params.ts` (`CAMERA_PARAMS`)                                                                                                                                                                          |                                                                                 |
| `01_packages/client/src/view/hud/`      | `Hud` + `hud.css` (F1-style timing strip), `format.ts` (times, deltas, sector colours), `DebugOverlay` (F3: telemetry, last impact)                                                                                                                                           |                                                                                 |
| `01_packages/client/src/dev/`           | Dev-only tools: `TuningPanel` (lil-gui, F2: car, collision, camera, surface + bot params); the dummy car (F4) is wired in `core/Game.ts`                                                                                                                                      | Dynamically imported under `import.meta.env.DEV`; absent from production builds |
| `01_packages/client/src/view/themes/`   | `theme.ts` (`TrackTheme`, `themeFor`), `classic.ts` (Test Ring look), `kruncar.ts` + `kruncarLayout.ts` (Kruncar look, prop positions), `monza.ts` + `monzaLayout.ts` (Monza look; layout generated from OSM)                                                                 | See `01_docs/themes.md`                                                         |
| `01_packages/client/src/view/scenery/`  | `placement.ts` (pure: clearance, scatter, apexes, track-relative spots; tested), `nature.ts`, `buildings.ts`, `trackside.ts`, `realCircuit.ts` (pit lane, old oval)                                                                                                           | See `01_docs/themes.md`                                                         |
| `01_packages/client/src/view/menu/`     | `TrackMenu` + `menu.css`: start screen, picks a track from `TRACKS` (Esc in race reloads back to it)                                                                                                                                                                          | See `01_docs/architecture.md`                                                   |
| `01_packages/client/src/main.ts`        | Bootstrap only: menu → `new Game(track)`                                                                                                                                                                                                                                      |                                                                                 |
| `01_packages/server/`                   | Future authoritative multiplayer server                                                                                                                                                                                                                                       | Placeholder only                                                                |
| `01_tools/openf1/`                      | Real-circuit tool (plain Node): OpenF1 + OpenStreetMap data in `data/` → generated `layouts/<id>.ts`; `circuits.ts` holds widths and adaptation; `calibrate.ts` fits the scale to the real pole; `scenery.ts` → generated `themes/<id>Layout.ts`                              | See its `README.md` and `01_docs/circuits.md`                                   |
| `01_docs/`                              | Topic docs                                                                                                                                                                                                                                                                    | See index below                                                                 |
| `03_F1Circuits/`                        | Owner's reference PNGs of the real circuits (shape and orientation of the layouts)                                                                                                                                                                                            | See `01_docs/circuits.md`                                                       |

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
- [01_docs/themes.md](01_docs/themes.md) — track looks: theme system, Kruncar and Monza looks, OSM scenery of real circuits, placement rules
- [01_docs/circuits.md](01_docs/circuits.md) — real circuits: OpenF1 + OSM pipeline, widths, scale vs real pole time, results
- [01_docs/laps.md](01_docs/laps.md) — free-practice timing, sectors/checkpoints, validity, HUD
- [01_docs/collisions.md](01_docs/collisions.md) — walls, car-vs-car, solver, impact events, parameters, measured behaviour
- [01_docs/physics.md](01_docs/physics.md) — car model (grip, brake pressure), conventions (units, axes, heading), parameters, measured behaviour
- [01_docs/bot.md](01_docs/bot.md) — bot opponent: levels, racing line, speed profile, measured lap times
- [01_docs/tuning.md](01_docs/tuning.md) — tuning baseline (v2 final, the reference setup), status flag, re-tune workflow
- [01_docs/roadmap.md](01_docs/roadmap.md) — phases and current status
- [01_docs/decisions.md](01_docs/decisions.md) — decision log (why we chose what we chose)

## Current status

Phase 1, step 9b done: **Monza** from real data (OpenF1 times/sectors, OpenStreetMap shape, published widths; Hard bot laps in the real pole time), with the `01_tools/openf1/` tool and per-track widths and sectors (see `01_docs/circuits.md`); 9b.2: its scenery from OpenStreetMap (see `01_docs/themes.md`). Step 9c: **Barcelona** circuit (same pipeline; classic look until its scenery, 9c.2). Tuning frozen as **baseline v2 (final)** (see `01_docs/tuning.md`). Next: Barcelona's scenery (9c.2), then 9d Monaco (see roadmap).
