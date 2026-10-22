# Roadmap

## Phase 0 — Scaffolding ✅

- Monorepo, tooling, docs, pixel-textured cube rendering in the browser.

## Phase 1 — Single-player (current)

Goal: a drivable, fun car with easy arcade drift on a trivial track, chase + first-person
cameras, minimal HUD, live physics tuning; then a bot opponent and 4 real tracks. All game logic lives in `shared` (deterministic).
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
   a min speed), kinematic drift (direction locked, controlled travel turn rate, bounded slip angle:
   no spin-outs), progressive grip recovery; `dev/TuningPanel.ts` with `lil-gui` (dev-only, F2, "copy as code").
4. **Test track + surfaces + collisions + reset**, split in two:
   - 4a ✅ **Track, surfaces, kerbs, reset** — multi-car `GameState` + `SimContext`; `track/`
     (spline → compiled `Track`, automatic low kerbs & gravel, declared high kerbs); per-wheel
     surfaces (asphalt/kerb/highKerb/grass/gravel) with high-kerb kick via `spin`;
     `InputCommand.reset` (R); `view/TrackView.ts`; "Test Ring" (~1.43 km, replaced by the ~1.94 km layout in the interlude). See `track.md`.
   - ✅ **Interlude (owner feedback)** — track ≥ 24 m with variable width and a new ~1.94 km layout;
     yaw inertia and blended, more in-line drift; C as second brake key (camera moves to V).
   - 4b ✅ **Collisions + dev target car** — `sim/collision/`: 3-circle car colliders, one-sided
     walls with anti-tunnelling and alignment assist, car-vs-car ("F1 arcade": momentum-conserving
     impulses, low friction, bounded non-stacking spin), impact events in `GameState.impacts`;
     parked dummy car (dev only, F4). Sparks and sounds come later. See `collisions.md`.
5. ✅ **Cameras** — `CameraRig` (toggle V, speed-based FOV),
   `ChaseCamera` adjustable live from the tuning panel (F2 → Camera), `FirstPersonCamera` with a
   minimal cockpit (real nose + front wing, `CockpitView` steering wheel + thin cockpit sides, never covering the track).
6. ✅ **HUD + laps** — free practice; `sim/laps.ts` (3 sectors as
   ordered checkpoints, times in ticks, reset invalidates the lap); `view/hud/Hud.ts` (F1-style strip
   top centre: lap, time, sector colours, last/best, speed, gap chip). See `laps.md`.
7. ✅ **Feel pass** — current values confirmed as defaults and frozen as **baseline v1, provisional**
   (`config/tuning.ts`, shown in F2/F3). Re-tune any time with the dev panel: see `tuning.md`.

8. ✅ **Bot opponent (Easy / Medium / Hard)** — blue car, a real car with collisions, driven by
   `ai/` (pure, in `shared`): a racing line relaxed to minimum curvature, a speed profile from the
   car's own grip and drift limits with braking zones, steering at a point ahead; Hard also drifts and
   drives a +3% car. Test Ring: Easy 40.3 s, Medium 34.1 s, Hard 27.8 s (owner's best: 29 s). Levels
   in `config/bot.ts`, live in F2. B cycles Off/Easy/Medium/Hard, the HUD shows the level, never the
   bot's times. Starts on Medium. See `bot.md`.
   - 8b ✅ **Track menu** — start screen (`view/menu/TrackMenu.ts`) listing every track in `TRACKS`
     (`track/layouts/index.ts`) with its length; mouse or W/S + Enter. Esc in a race goes back to it
     (page reload). The Test Ring stays selectable.

9. **Tracks: Kruncar first, then Monza, Barcelona, Monaco** — four new `TrackDefinition`s in
   `track/layouts/`, each added to `TRACKS` (so it appears in the menu), passing the layout tests,
   with its section in `track.md` and its sector gantries (fixed rule). The bot (step 8) must lap every track.
   - 9a.1 ✅ **Kruncar layout** — inspired by the Krunker.io map "KrunCar" by Keybi
     (https://krunker.io/?game=FRA:qtesb), from the owner's corner sequence and screenshots; ~2.56 km,
     24–32 m, high kerbs in the narrow wooden section. Hard bot 45.0 s (target ~45 s), Medium 50.3 s,
     Easy 63.8 s. Bot fix found on the way: no drift right after an opposite corner (Test Ring Hard
     27.8 → 28.6 s, still under the owner's 29 s). Layout and bot tests now run on every track.
   - 9a.2 ✅ **Kruncar look** — theme system (`view/themes/`, classic look kept for the Test Ring) and
     Krunker-style scenery (`view/scenery/`): mint sky, grey mountains, light speckled asphalt,
     pink/white kerbs along every edge (also physics), lime grass, wooden fences and concrete +
     chain fence, run-off 6 m, grandstands with floodlights, three rivers with ponds and wooden
     bridges (one covered), barn, hay bales, chevron boards, trees, balloons. See `themes.md`.
   - 9a.3 ✅ **Kruncar fork** — branches in the engine (`TrackDefinition.branches`, `Track.routes`,
     one wall outline for all roads, `locateOnTrack` per road with main-loop progress); Kruncar's
     wooden section becomes a fork: wide road with two comfortable corners or a 14 m wooden zigzag
     shortcut. Hard bot takes the shortcut (`shortcuts`), 44.5 s; Medium 50.0 s, Easy 60.9 s.
   - 9a.4 ✅ **Brake drifting (owner feedback)** — no drift key: Space is the brake, with a
     pressure that builds while held (30% on a tap, 100% after 0.6 s); S reverses (brakes first if
     rolling forward); C unbound. Braking too hard in a fast corner (`slideLoad`: corner load +
     brake pressure) starts the existing drift; it lasts while A/D is held. Straights, soft and slow
     corners keep full grip. Hard bot drifts by braking, Easy/Medium cap their brake below the slide.
     Test Ring Hard 29.07 s, Medium 33.58 s, Easy 40.22 s; Kruncar 44.05 / 49.40 / 60.53 s.
     See `physics.md`.
   - 9a.5 ✅ **Drift removed (owner feedback)** — grip-only handling: no drift mode, the brake only
     slows the car (pressure as in 9a.4). Owner's F2 values as defaults (`maxYawRate` 2.7,
     `yawResponse` 9.5). Bots drive grip only. Test Ring Hard 31.35 s, Medium 31.95 s, Easy 38.15 s;
     Kruncar 44.55 / 44.98 / 56.58 s. Confirmed by the owner and frozen as **baseline v2 (final)**,
     the reference setup. See `decisions.md`, `tuning.md`.
   - 9b–d **Monza, Barcelona, Monaco** — inspired by the real circuits (their character, not 1:1
     copies: scaled to our ≥ 24 m width and arcade speeds).

Out of scope for Phase 1: audio, menus beyond the track menu, gamepad, networking.

## Phase 2 — Multiplayer (next)

- `01_packages/server`: Node.js + WebSocket, authoritative simulation using `shared`.
- Client-side prediction + reconciliation, interpolation of remote cars.
- Test over Tailscale.

## Later

- Desktop packaging (Tauri/Electron), further tracks beyond the step 9 set, assets, audio.
