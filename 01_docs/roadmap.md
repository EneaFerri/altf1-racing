# Roadmap

## Phase 0 — Scaffolding ✅

- Monorepo, tooling, docs, pixel-textured cube rendering in the browser.

## Phase 1 — Single-player on a test track (current)

Goal: a drivable, fun car with easy arcade drift on a trivial track, chase + first-person
cameras, minimal HUD, live physics tuning. All game logic lives in `shared` (deterministic).
Workflow: one step at a time → owner review → commit after OK.

Conventions (units, axes, heading): see [physics.md](physics.md). Time is counted in ticks (60 Hz).

1. ✅ **Game loop + Controller + debug overlay** — `core/GameLoop.ts` (fixed-step accumulator,
   0.25 s frame clamp), `controller/` (keyboard → `InputCommand` via `KeyboardEvent.code`,
   one-shot actions separate), `view/hud/DebugOverlay.ts` (F3: tick, TPS, FPS, input),
   minimal `sim/game.ts`, pixel grid ground.
2. ✅ **Basic car physics + simple chase cam** — `config/car.ts` (`CAR_PARAMS`), `sim/car.ts`
   (forward/lateral split, throttle curve, brake → reverse, drag, steering smoothed in the Model,
   speed-dependent yaw, lateral grip), `math/`, `view/CarView.ts` (low-poly box car),
   `view/cameras/ChaseCamera.ts`, `01_docs/physics.md`. Tests incl. determinism.
3. ✅ **Easy arcade drift + tuning panel** — `drifting` state with hysteresis (Space + steer above
   a min speed), low grip + more yaw, capped slip angle (no spin-outs), progressive grip
   recovery; `dev/TuningPanel.ts` with `lil-gui` (dev-only, F2, "copy as code").
4. **Test track + surfaces + collisions + reset**, split in two:
   - 4a ✅ **Track, surfaces, kerbs, reset** — multi-car `GameState` + `SimContext`; `track/`
     (spline → compiled `Track`, automatic low kerbs & gravel, declared high kerbs); per-wheel
     surfaces (asphalt/kerb/highKerb/grass/gravel) with high-kerb kick via `spin`;
     `InputCommand.reset` (R); `view/TrackView.ts`; "Test Ring" (~1.43 km). See `track.md`.
   - 4b **Collisions + dev target car** — `sim/collision/`: 3-circle car colliders, one-sided
     walls, car-vs-car, impulse solver with spin, impact events; parked dummy car (dev only).
5. **Cameras** — `FirstPersonCamera.ts`, `CameraRig.ts` (toggle C, speed-based FOV).
6. **HUD + laps** — `sim/laps.ts` (finish line + ordered checkpoints, times in ticks),
   `view/hud/Hud.ts` (speed, lap, last/best).
7. **Feel pass** — tune together, freeze values in `config/car.ts`, update docs.

Out of scope for Phase 1: audio, AI opponents, menus, more tracks, gamepad, networking.

## Phase 2 — Multiplayer

- `01_packages/server`: Node.js + WebSocket, authoritative simulation using `shared`.
- Client-side prediction + reconciliation, interpolation of remote cars.
- Test over Tailscale.

## Later

- Desktop packaging (Tauri/Electron), more tracks, assets, audio.
