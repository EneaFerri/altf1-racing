# Architecture

An MVC variant adapted to games: the simulation (Model) is fully separated from rendering (View)
and input (Controller), so the same Model can later run on an authoritative server.

```
 keyboard ──► Controller ──InputCommand──► Model.step(state, input, FIXED_DT) ──► state
                                                                              │
                                       View.render(prev, curr, alpha, frameSeconds) ◄┘
```

`Game` keeps the state before and after the last tick; the View draws `alpha` (0..1) of the way
between them, so motion is smooth at any refresh rate even though the Model ticks at 60 Hz.

## Model — `01_packages/shared`

- Plain data (`GameState`, `CarState`, `InputCommand`) + pure functions.
- `stepGame(state, input, params = CAR_PARAMS)` → `stepCar` per car. Physics, units and axis
  conventions: [physics.md](physics.md).
- Advances only in fixed ticks (`TICK_RATE` = 60 Hz, `FIXED_DT`) → deterministic and testable.
- Must not import `three` or touch the DOM (ESLint rule in `eslint.config.js`).

## View — `01_packages/client/src/view`

- Reads state, never writes it.
- `SceneView` interpolates the car pose and hands it to `CarView` (mesh, steering wheels, wheel spin)
  and `ChaseCamera`. Planned: first-person camera + toggle (step 5), HUD (step 6).
- `frameSeconds` is used only for visual smoothing (camera, wheel spin), never for gameplay.
- Pixel look: tiny textures with `NearestFilter`, no antialiasing. Optional low-res render pass (off by default).

## Controller — `01_packages/client/src/controller`

- `bindings.ts`: key map + pure `inputFromKeys()`; `KeyboardController` samples it once per tick.
- Bindings (now): W throttle · S brake/reverse · A/D steer · Space handbrake · F3 debug overlay.
  Planned: C camera · R reset · F2 tuning panel.
- One-shot actions (`ACTION_KEYS`) trigger callbacks and never enter the simulation.
- In multiplayer, the same `InputCommand`s are what gets sent to the server.

## Game loop — `01_packages/client/src/core`

- `GameLoop`: fixed-timestep accumulator for the simulation, frames clamped to 0.25 s; rendering runs
  at display rate with `render(alpha, frameSeconds)`.
- Browser-specific APIs are isolated in `core/` so a desktop wrapper (Tauri/Electron) stays easy.
