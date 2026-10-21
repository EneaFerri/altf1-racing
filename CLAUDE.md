# AltF1 Racing — Project Memory

Arcade F1-style racing game, Krunker.io-style pixel look (low-poly 3D + crisp nearest-filtered
textures), drift-based handling, first/third-person cameras, WASD controls.
Browser-first; must stay easy to wrap as a desktop app later. Multiplayer (client-server) comes later.

## Working rules (top priority)

1. **Keep the repo clean.** Every file has an obvious home (see map below). No stray files, no dead code.
2. **Keep this file and `01_docs/` updated** with every meaningful change. When a topic grows, move it
   to its own `01_docs/*.md` and leave only a link here — this file is the index.
3. **Small steps.** One feature per step, then stop for the owner's review.
4. **Everything in English** (code, comments, docs).
5. **Naming:** project-owned top-level folders get a numeric prefix (`01_docs`, `01_packages`) so they
   sort above generated stuff. `CLAUDE.md` and `README.md` keep their exact names (tools rely on them).

## Stack

TypeScript (strict) · Three.js · Vite · Vitest · ESLint + Prettier · npm workspaces.
Future server: Node.js + `ws`. Rationale in [01_docs/decisions.md](01_docs/decisions.md).

## Repo map

| Path                                   | Role                                                                                              | Notes                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `01_packages/shared/src/sim/`          | **Model** — `game.ts` (`GameState`, `stepGame`), `car.ts` (`stepCar`, arcade physics)             | Pure, one fixed tick. No `three`/DOM (ESLint). Server will reuse it. |
| `01_packages/shared/src/config/`       | `sim.ts` (`TICK_RATE`), `car.ts` (`CAR_PARAMS` handling values)                                   | Param meanings in `01_docs/physics.md`                               |
| `01_packages/shared/src/math/`         | `vec2.ts` (`Vec2 {x,z}`, `forward`/`right`), `angle.ts`                                           |                                                                      |
| `01_packages/shared/src/types/`        | `InputCommand`                                                                                    |                                                                      |
| `01_packages/client/src/core/`         | `GameLoop` (fixed-step accumulator), `Game` (wires M-V-C, keeps prev/curr state)                  | Only place using `requestAnimationFrame`                             |
| `01_packages/client/src/controller/`   | **Controller** — `bindings.ts` (key map), `KeyboardController`                                    | Uses `KeyboardEvent.code` (layout-independent)                       |
| `01_packages/client/src/view/`         | **View** — `SceneView` (scene + interpolation), `CarView` (low-poly F1), pixel textures, renderer | Reads state, never writes it                                         |
| `01_packages/client/src/view/cameras/` | `ChaseCamera` (smoothed yaw, fixed distance)                                                      |                                                                      |
| `01_packages/client/src/view/hud/`     | `DebugOverlay` (F3: tick/TPS/FPS, input, car telemetry)                                           |                                                                      |
| `01_packages/client/src/main.ts`       | Bootstrap only                                                                                    |                                                                      |
| `01_packages/server/`                  | Future authoritative multiplayer server                                                           | Placeholder only                                                     |
| `01_docs/`                             | Topic docs                                                                                        | See index below                                                      |

Tests live next to the file they test (`*.test.ts`). Unused params must be prefixed with `_`.

## Commands

```
npm install        # once
npm run dev        # dev server (also reachable on LAN/Tailscale)
npm test           # Vitest
npm run typecheck  # tsc in every package
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # production build of the client
```

## Generated files (never edit, all git-ignored except the lockfile)

- `node_modules/` — installed libraries. Only one, at the root; Vite's cache lives in
  `node_modules/.vite` (`cacheDir` in `01_packages/client/vite.config.ts`). No package may get its own.
- `01_packages/*/dist/` — output of `npm run build`; safe to delete anytime.
- `package-lock.json` — exact dependency versions. **Committed**, never hand-edited.
- `.DS_Store` — macOS Finder metadata.

`.vscode/settings.json` hides `node_modules`, `dist` and `.DS_Store` from the VS Code file tree.

## Docs index

- [01_docs/architecture.md](01_docs/architecture.md) — MVC split, game loop, data flow
- [01_docs/physics.md](01_docs/physics.md) — car model, conventions (units, axes, heading), parameters
- [01_docs/roadmap.md](01_docs/roadmap.md) — phases and current status
- [01_docs/decisions.md](01_docs/decisions.md) — decision log (why we chose what we chose)

## Current status

Phase 1, step 2 done (drivable car with arcade physics, chase camera). Next: step 3, arcade drift + live tuning panel (see roadmap).
