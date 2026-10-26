# Architecture

An MVC variant adapted to games: the simulation (Model) is fully separated from rendering (View)
and input (Controller), so the same Model can later run on an authoritative server.

```
 keyboard ──► Controller ──{ carId: InputCommand }──► stepGame(state, inputs, ctx) ──► state
                                                                                      │
                                               View.render(prev, curr, alpha, frameSeconds) ◄┘
```

`SinglePlayerGame` keeps the state before and after the last tick; the View draws `alpha` (0..1) of the way
between them, so motion is smooth at any refresh rate even though the Model ticks at 60 Hz.

## Model — `01_packages/shared`

- Plain data (`GameState`, `CarState`, `InputCommand`) + pure functions.
- **Multi-car from the start**: `GameState { tick, cars, impacts, laps }`, cars sorted by `id`; inputs arrive as
  `{ [carId]: InputCommand }` (missing = neutral). The same shape will carry network inputs.
- **`SimContext { track, carParams, carParamsById?, surfaceParams, collisionParams }`**: static data passed to every `stepGame` call,
  never stored in the state. `carParamsById` lets a car drive its own `CarParams` (the bot's +3% car). `SinglePlayerGame` owns live copies of the params, so tuning never touches Model code.
- **Order of one tick**: per car, in id order: reset if requested → sample wheel surfaces →
  `stepCar` with the surface effect. Then **one collision pass** for all cars (`resolveCollisions`:
  car pairs, then walls), which also fills `impacts` with that tick's hits (events for later sparks and sounds).
  Finally **lap timing** reads where each car ended up (`GameState.laps`, see [laps.md](laps.md)).
- Physics, units and axis conventions: [physics.md](physics.md). Track & surfaces: [track.md](track.md).
  Collisions: [collisions.md](collisions.md).
- Advances only in fixed ticks (`TICK_RATE` = 60 Hz, `FIXED_DT`) → deterministic and testable.
- Must not import `three` or touch the DOM (ESLint rule in `eslint.config.js`).

## View — `01_packages/client/src/view`

- Reads state, never writes it.
- `SceneView` keeps one `CarView` per car id (created when a car first appears and disposed when it
  leaves, so opponents need no extra wiring), interpolates each car's pose, and feeds the followed car
  to the `CameraRig`. Liveries per car id (`LIVERIES` in `pixelTexture.ts`): player red, bot blue,
  anything else grey; online, `PLAYER_LIVERIES` by the server's index (`setLivery`), plus a
  nickname tag (`NameTag`) over every other car (`setNameTags`).
- **Cameras** (`view/cameras/`): `CameraRig` owns the single `PerspectiveCamera` and switches (V)
  between `ChaseCamera` (behind the car, smoothed yaw only) and `FirstPersonCamera` (driver's eye,
  locked to the car). Both get a **speed FOV** (`speedFov`: + `fovSpeedGain` degrees at
  `fovSpeedRef`, smoothed). Values live in `view/cameras/params.ts` (`CAMERA_PARAMS`). They are
  view-only, so they stay in the client, and `SinglePlayerGame` passes a live copy that the tuning panel edits.
- **Look back** (Z held): `SinglePlayerGame` sets `CameraRig.lookBack` every frame from the held key, and
  either camera turns its view by π (`viewYawOffset`): the chase camera moves in front of the car
  and looks back at it (its smoothed yaw keeps running, so release brings the normal view back with
  no swing), the first-person eye looks backwards from the same spot and hides the cockpit overlay.
  The flip is instant both ways; the speed FOV is unchanged.
- **Cockpit** (`CockpitView`): in first person the own car's body is hidden (the eye is inside it)
  except its **nose and front wing**, and a slim front tub (first person only) links them down to the
  steering wheel (`CarView.setFirstPerson`). These are real world geometry with
  normal depth, so they show where the car points and how far lines, kerbs, walls and other cars really
  are. On top of that, a small steering wheel (turns with the smoothed steer) and two thin cockpit sides
  are drawn as an overlay.
  They are attached to the camera and laid out in screen units (1 = half the screen height), so they
  always cover the same small strip: the wheel stays in the bottom ~12% (centre), the sides in the
  bottom corners. They are drawn last without depth test, so a wall can never cut through them.
- **Wind lines** (`WindLines`): while the followed car is in a slipstream, ~14 thin white streaks
  flow outward along the sides of the screen (never across the car or the HUD). Attached to the
  camera in screen units like the cockpit, same in both views, hidden while looking back. Opacity is
  `windLineOpacity(car.slipstream)` (max 0.5) and the streaks get a bit longer with it, so they grow
  in step with the HUD's SLIP %. Model: [physics.md](physics.md#slipstream).
- `TrackView` builds asphalt, kerbs, high kerbs, gravel, walls, the start line and the sector
  gantries from the same compiled `Track` the physics uses.
- **Themes** (`view/themes/`): sky, light, ground, asphalt, kerb colours, wall style and scenery per
  track (`themeFor(track.name)`; Kruncar has its own, other tracks the classic look). Scenery builders
  in `view/scenery/`. Details: [themes.md](themes.md).
- **HUD** (`view/hud/Hud.ts` + `hud.css`): F1-style timing strip at the top centre (lap, running time,
  sector bars, last/best, speed, SLIP bar + % of slipstream, bot level) with a sector-gap chip; always on. The F3 debug overlay stays top left.
  Details: [laps.md](laps.md#hud-top-centre).
- `frameSeconds` is used only for visual smoothing (camera, wheel spin), never for gameplay.
- Pixel look: tiny textures with `NearestFilter`, no antialiasing, full-resolution render. A low-res
  render pass (whole scene pixelated) is not implemented; it remains a possible later option.

## Bot — `01_packages/shared/src/ai`

- A bot is a second source of `InputCommand`s: each tick `SinglePlayerGame` asks `botInput` for the bot's
  input and passes it to `stepGame` with the player's. The simulation doesn't know which car is a bot,
  so the server can drive bots the same way later. Details: [bot.md](bot.md).
- Cars join and leave with `placeCar` / `removeCar` (`sim/game.ts`, pure), applied to the current and
  previous state together.

## Controller — `01_packages/client/src/controller`

- `bindings.ts`: key map + pure `inputFromKeys()`; `KeyboardController` samples it once per tick.
- Bindings (now): W throttle · Space brake (held longer = harder) ·
  S reverse (brakes first if rolling forward) · A/D steer · R reset ·
  V camera (chase / first person) · Z look back (held) · B bot level · Esc back to the track menu · F2 tuning panel (dev) · F3 debug overlay · F4 park the dummy car
  ahead (dev). No key may be bound twice (tested).
- Four kinds of keys: **drive keys** (held, sampled per tick), **view keys** (`VIEW_KEYS`, e.g. Z:
  held, read every frame with `KeyboardController.isHeld`, view only), **tick triggers**
  (`TICK_TRIGGER_KEYS`, e.g. R: pressed once, delivered as `InputCommand.reset = true` for exactly
  one tick, so the simulation handles them and they can travel over the network) and **actions**
  (below).
- Keys are ignored while a text field has focus (e.g. typing a value in the tuning panel).
- One-shot actions (`ACTION_KEYS`) trigger callbacks and never enter the simulation.
- In multiplayer, the same `InputCommand`s are what gets sent to the server.

## Startup — `01_packages/client/src/main.ts`

- `main.ts` shows the **start screen** (`view/menu/ModeMenu.ts`): **Singleplayer / Multiplayer**,
  then loads only the chosen mode with a dynamic `import()`:
  - `singleplayer/start.ts` → the **track menu** (`view/menu/TrackMenu.ts`): every entry of
    `TRACKS` (`shared/src/track/layouts/index.ts`) with its length. The chosen `TrackDefinition` goes
    to `new SinglePlayerGame(track)`, which builds the `Track` and everything that depends on it.
  - `multiplayer/start.ts` → the **nickname screen**, then the **circuit choice** (Monza,
    Barcelona, Monaco) and the **online race** (`OnlineGame`) in that circuit's room, over a WebSocket to the multiplayer server
    (`01_packages/server`). Details: [multiplayer.md](multiplayer.md).
- Every menu is a `ListMenu` (`view/menu/ListMenu.ts` + `menu.css`): mouse, or W/S (↑/↓) + Enter;
  Esc in the track menu goes back to the start screen.
- The two modes never mix (owner's rule): separate folders, loaded on demand (the production build
  emits a chunk per mode), and an ESLint boundary forbids imports between them and from the shared
  building blocks (`core`, `controller`, `dev`, `view`) into either. Details:
  [multiplayer.md](multiplayer.md#separation-of-the-two-modes-21a).
- **Esc** in a race (`backToMenu` action) reloads the page, which brings the start screen back.

## Game loop — `01_packages/client/src/core`

- `GameLoop`: fixed-timestep accumulator for the simulation, frames clamped to 0.25 s; rendering runs
  at display rate with `render(alpha, frameSeconds)`.
- Browser APIs (`window`, `document`, `requestAnimationFrame`, `performance`) are used only in the
  `client` package; `shared` has none (enforced by ESLint). The client is a plain web page, so a desktop
  wrapper (Tauri/Electron) can load it unchanged.

## Dev tools — `01_packages/client/src/dev`

- Development-only helpers, loaded with a dynamic `import()` **inside** `if (import.meta.env.DEV)` in
  `SinglePlayerGame`. In production that condition is the constant `false`, so the bundler drops the code and its
  dependencies (verified: no lil-gui in the build output). Keeping the `import()` inside the `if`
  matters: moved to a separate method, Vite would still emit the chunk.
- `TuningPanel` (F2): lil-gui sliders for every `CarParams` value (Engine & brakes incl. brake pressure / Steering & grip),
  every `CollisionParams` value (Collisions), every `SlipstreamParams` value (Slipstream), every `CameraParams` value (Camera → Chase /
  First person / Speed FOV), every surface (Surfaces → grip, traction, drag, bumpSpin) and every bot
  level (Bot → easy / medium / hard). Mutates
  `SinglePlayerGame`'s live params; **Copy as code** logs (and copies to the clipboard when available)
  ready-to-paste `CAR_PARAMS`, `COLLISION_PARAMS`, `SLIPSTREAM_PARAMS`, `SURFACE_PARAMS`, `BOT_PARAMS` and `CAMERA_PARAMS`; **Reset to
  defaults** restores the frozen baseline. The title shows the baseline label; re-tune workflow in
  [tuning.md](tuning.md).
- **Dummy car**: in dev, `SinglePlayerGame` adds a parked car (`'dummy'`, grid slot 2, no input) to crash into.
  F4 parks it 25 m ahead of the player on the centreline (`placeCar` in `sim/game.ts`, pure, applied
  to both the current and previous state). It is drawn grey.
