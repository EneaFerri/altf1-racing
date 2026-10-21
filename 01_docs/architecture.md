# Architecture

An MVC variant adapted to games: the simulation (Model) is fully separated from rendering (View)
and input (Controller), so the same Model can later run on an authoritative server.

```
 keyboard ──► Controller ──{ carId: InputCommand }──► stepGame(state, inputs, ctx) ──► state
                                                                                      │
                                               View.render(prev, curr, alpha, frameSeconds) ◄┘
```

`Game` keeps the state before and after the last tick; the View draws `alpha` (0..1) of the way
between them, so motion is smooth at any refresh rate even though the Model ticks at 60 Hz.

## Model — `01_packages/shared`

- Plain data (`GameState`, `CarState`, `InputCommand`) + pure functions.
- **Multi-car from the start**: `GameState { tick, cars }`, cars sorted by `id`; inputs arrive as
  `{ [carId]: InputCommand }` (missing = neutral). The same shape will carry network inputs.
- **`SimContext { track, carParams, surfaceParams }`**: static data passed to every `stepGame` call,
  never stored in the state. `Game` owns live copies of the params, so tuning never touches Model code.
- **Order of one tick** (per car, in id order): reset if requested → sample wheel surfaces →
  `stepCar` with the surface effect. Step 4b appends the collision pass after all cars have moved.
- Physics, units and axis conventions: [physics.md](physics.md). Track & surfaces: [track.md](track.md).
- Advances only in fixed ticks (`TICK_RATE` = 60 Hz, `FIXED_DT`) → deterministic and testable.
- Must not import `three` or touch the DOM (ESLint rule in `eslint.config.js`).

## View — `01_packages/client/src/view`

- Reads state, never writes it.
- `SceneView` keeps one `CarView` per car id (created when a car first appears, so opponents need
  no extra wiring), interpolates each car's pose, and feeds the followed car to `ChaseCamera`.
- `TrackView` builds asphalt, kerbs, high kerbs, gravel, tyre walls and the start line from the same
  compiled `Track` the physics uses. Planned: first-person camera + toggle (step 5), HUD (step 6).
- `frameSeconds` is used only for visual smoothing (camera, wheel spin), never for gameplay.
- Pixel look: tiny textures with `NearestFilter`, no antialiasing. Optional low-res render pass (off by default).

## Controller — `01_packages/client/src/controller`

- `bindings.ts`: key map + pure `inputFromKeys()`; `KeyboardController` samples it once per tick.
- Bindings (now): W throttle · S brake/reverse · A/D steer · Space handbrake/drift · R reset ·
  F2 tuning panel (dev) · F3 debug overlay. Planned: C camera.
- Three kinds of keys: **drive keys** (held, sampled per tick), **tick triggers** (`TICK_TRIGGER_KEYS`,
  e.g. R: pressed once, delivered as `InputCommand.reset = true` for exactly one tick, so the
  simulation handles them and they can travel over the network) and **actions** (below).
- Keys are ignored while a text field has focus (e.g. typing a value in the tuning panel).
- One-shot actions (`ACTION_KEYS`) trigger callbacks and never enter the simulation.
- In multiplayer, the same `InputCommand`s are what gets sent to the server.

## Game loop — `01_packages/client/src/core`

- `GameLoop`: fixed-timestep accumulator for the simulation, frames clamped to 0.25 s; rendering runs
  at display rate with `render(alpha, frameSeconds)`.
- Browser-specific APIs are isolated in `core/` so a desktop wrapper (Tauri/Electron) stays easy.

## Dev tools — `01_packages/client/src/dev`

- Development-only helpers, loaded with a dynamic `import()` **inside** `if (import.meta.env.DEV)` in
  `Game`. In production that condition is the constant `false`, so the bundler drops the code and its
  dependencies (verified: no lil-gui in the build output). Keeping the `import()` inside the `if`
  matters: moved to a separate method, Vite would still emit the chunk.
- `TuningPanel` (F2): lil-gui sliders for every `CarParams` value (Engine & brakes / Steering & grip /
  Drift) and every surface (Surfaces → grip, traction, drag, bumpSpin). Mutates `Game`'s live params;
  **Copy as code** logs (and copies to the clipboard when available) ready-to-paste `CAR_PARAMS` and
  `SURFACE_PARAMS`; **Reset to defaults** restores the config files' values.
