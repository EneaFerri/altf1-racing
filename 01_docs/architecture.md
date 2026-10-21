# Architecture

An MVC variant adapted to games: the simulation (Model) is fully separated from rendering (View)
and input (Controller), so the same Model can later run on an authoritative server.

```
 keyboard ──► Controller ──InputCommand──► Model.step(state, input, FIXED_DT) ──► state
                                                                              │
                                                    View.render(prev, curr, alpha) ◄┘
```

## Model — `01_packages/shared`

- Plain data (`GameState`, `CarState`, `InputCommand`) + pure functions.
- Advances only in fixed ticks (`TICK_RATE` = 60 Hz, `FIXED_DT`) → deterministic and testable.
- Must not import `three` or touch the DOM (ESLint rule in `eslint.config.js`).

## View — `01_packages/client/src/view`

- Reads state, never writes it.
- Builds the Three.js scene, cameras (chase cam default, first-person toggle), HUD.
- Pixel look: tiny textures with `NearestFilter`, no antialiasing. Optional low-res render pass (off by default).

## Controller — `01_packages/client/src/controller`

- `bindings.ts`: key map + pure `inputFromKeys()`; `KeyboardController` samples it once per tick.
- Bindings (now): W throttle · S brake/reverse · A/D steer · Space handbrake · F3 debug overlay.
  Planned: C camera · R reset · F2 tuning panel.
- One-shot actions (`ACTION_KEYS`) trigger callbacks and never enter the simulation.
- In multiplayer, the same `InputCommand`s are what gets sent to the server.

## Game loop — `01_packages/client/src/core`

- `GameLoop`: fixed-timestep accumulator for the simulation, frames clamped to 0.25 s; rendering runs at display rate and
  interpolates between the last two states for smooth motion.
- Browser-specific APIs are isolated in `core/` so a desktop wrapper (Tauri/Electron) stays easy.
