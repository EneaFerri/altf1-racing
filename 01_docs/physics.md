# Car Physics

Arcade kinematic model in `01_packages/shared/src/sim/car.ts`, parameters in
`01_packages/shared/src/config/car.ts`. Pure and deterministic: `stepCar(car, input, params, dt)`
runs once per fixed tick (60 Hz) with the surface effect under the car (see [track.md](track.md))
and returns a new `CarState`. Each tick runs one of two modes:
**grip** (normal driving) or **drift**.

## Conventions

- **Units:** SI — metres, seconds, m/s, radians. The View converts to km/h (× 3.6).
- **Plane:** `Vec2 { x, z }` = the Three.js ground axes, so the View needs no conversion.
- **Heading:** radians, `0` = facing −Z, positive = counter-clockwise seen from above (turning left).
  `forward(h) = (−sin h, −cos h)`, `right(h) = (cos h, −sin h)`, `headingOf(v)` is the inverse of `forward`;
  in the View `rotation.y = heading`.
- **Steer:** `+1` = right (same as `InputCommand`), so steering right makes `heading` decrease.
- **Slip angle:** `slipAngle(car) = headingOf(velocity) − heading`, the angle between where the car
  travels and where it points.

## State

| Field            | Meaning                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `id`             | Unique car id (`'player'`, later opponents / network players)                                      |
| `position`       | World position (m)                                                                                 |
| `velocity`       | World velocity (m/s); may point away from `heading` while sliding                                  |
| `heading`        | Facing angle (rad)                                                                                 |
| `yawRate`        | Smoothed turn rate (rad/s), with inertia: of the heading in grip, of the travel direction in drift |
| `spin`           | Extra rotation from external kicks (high kerbs, later impacts), decays with `spinDamping` (rad/s)  |
| `steer`          | Smoothed steering −1..1                                                                            |
| `drifting`       | Whether the drift mode is active                                                                   |
| `driftDirection` | Side locked at drift start: 1 = right, −1 = left, 0 = not drifting                                 |
| `gripRecovery`   | 0 right after a drift, back to 1 (full grip) over `driftRecoveryTime`                              |
| `wheelSurfaces`  | Surface under each wheel (FL, FR, RL, RR), sampled at the start of the last tick                   |

## Mode selection (every tick)

```
            handbrake + steer ≠ 0 + vF > driftMinSpeed
   GRIP ───────────────────────────────────────────────► DRIFT
     ▲                                                     │
     └──── handbrake released  OR  speed < driftExitSpeed ─┘
```

`driftExitSpeed < driftMinSpeed` (hysteresis), so the car can't flicker in and out of a drift.

## Grip mode, step by step

1. **Steering smoothing** — `steer` moves towards `input.steer` at `steerSpeed`, or `steerReturnSpeed`
   when releasing or switching side. Done in the Model so client and server agree (both modes).
2. **Split velocity** into `vF` (along `forward`) and `vL` (along `right`).
3. **Longitudinal (`vF`)**
   - Throttle: `vF += engineAccel · throttle · (1 − vF / maxSpeed) · dt`; if rolling backwards it brakes instead.
   - Brake: decelerates by `brakeDecel` while `vF > 0.3 m/s`, then engages reverse (`reverseAccel`, capped at `maxReverseSpeed`).
   - No pedal: `coastDecel`. Always: air drag `airDrag · vF²` and the surface `drag`. Handbrake (when not drifting): `handbrakeDecel`.
   - Thrust and braking are multiplied by the surface `traction`.
4. **Lateral grip** — `vL *= exp(−grip · dt)`, with `grip = lerp(driftExitGrip, lateralGrip, gripRecovery) · surface.grip`.
5. **Yaw** — target `−steer · maxYawRate · lowSpeed · highSpeed · sign(vF)`
   - `lowSpeed = min(1, |vF| / fullTurnSpeed)` → no turning on the spot.
   - `highSpeed = 1 − highSpeedSteerLoss · |vF| / maxSpeed` → calmer steering when fast.
   - `sign(vF)` → steering is inverted in reverse, like a real car.
   - **Yaw inertia**: the actual `yawRate` approaches that target exponentially,
     `yawRate += (target − yawRate) · (1 − exp(−yawResponse · dt))`. Combined with the steering ramp,
     turning in and out is progressive instead of a step on every key press (~0.6 s to 90% at 100 km/h).
6. **Integrate** — `heading += (yawRate + spin) · dt` (wrapped to (−π, π]), velocity recomposed from `vF`/`vL`, `position += velocity · dt`.
7. **Drift exit bonus** — while `gripRecovery < 1`, the velocity is rescaled to keep the speed the car
   had before grip removed the sideways part: straightening after a drift costs no speed.

Because velocity is recomposed in the _old_ frame and the car then rotates, part of the speed becomes
lateral on the next tick and grip pulls it back in line: a slight natural slip in normal turns.

## Drift mode — easy arcade style

The drift is **kinematic and controlled** (Mario Kart / Ridge Racer style), not emergent from tyre
physics. It works on the direction of travel and the slip angle directly:

1. **Direction lock** — the side (`driftDirection`) is fixed on entry; steering then only modulates.
   `steerInto = steer · driftDirection`: +1 = steering into the turn, −1 = countersteering.
2. **Travel direction** turns towards `driftTurnRate · (1 + driftSteerInfluence · steerInto)`, starting
   from the `yawRate` the car already had and blending in at `driftTurnResponse`. So a drift
   **continues the corner you were taking** instead of snapping onto a new line; `yawRate` then holds
   the travel direction's turn rate, which also keeps the exit continuous.
3. **Slip angle** moves exponentially (`driftRotateStiffness`) towards
   `driftAngle + driftAngleSteerRange · steerInto` and is clamped to `driftAngle + driftAngleSteerRange`.
   The heading is then `travel − driftDirection · slip`.
   The slip itself is smoothed, not the heading: a heading that chases a still-turning target
   always lags behind and never reaches the wanted angle.
4. **Speed** — same `longitudinal()` as grip mode (throttle, brake, drag, surface) minus `driftDrag`.
   You can drift on grass, but its drag slows you down fast.

**Why a spin-out is impossible:** the slip is clamped so it never exceeds `driftAngle + range` (≈ 30°),
whatever the input; it builds up from ~0° on entry and settles between `driftAngle − range` and
`driftAngle + range` (≈ 10°–30°). A test checks this over 5 s of drifting.

## Surfaces, spin and reset

- **Surface effect** (`sim/surface.ts`): before each `stepCar`, the four wheels' surfaces are averaged
  into `{ grip, traction, drag, spinKick, breaksDrift }`. Values and rules: [track.md](track.md#surfaces-configsurfacests--surface_params).
- **Spin**: `spin = (spin + spinKick) · exp(−spinDamping · dt)`. In grip mode it rotates the heading
  on top of steering; velocity is unchanged, so the car is knocked off-line and grip pulls it back.
  In drift mode it only decays (strong kicks end the drift anyway).
- **High kerbs** (`breaksDrift`): a wheel climbing onto one forces grip mode for that tick, so a
  drift can't survive cutting the chicane.
- **Reset** (`InputCommand.reset`, R): handled in `stepGame`, not `stepCar` — the car is placed at
  the closest centreline point, facing the driving direction, at rest (`createCar` with the same id).

## Parameters

| Param                  | Value  | Unit  | Higher means…                                              |
| ---------------------- | ------ | ----- | ---------------------------------------------------------- |
| `maxSpeed`             | 80     | m/s   | Higher engine limit (real top speed is lower, see below)   |
| `engineAccel`          | 18     | m/s²  | Punchier launch                                            |
| `brakeDecel`           | 30     | m/s²  | Shorter braking                                            |
| `reverseAccel`         | 8      | m/s²  | Faster reverse pickup                                      |
| `maxReverseSpeed`      | 10     | m/s   | Faster reverse                                             |
| `coastDecel`           | 1.5    | m/s²  | Car slows faster off the pedals                            |
| `airDrag`              | 0.0005 | 1/m   | Lower top speed, slower near the top                       |
| `steerSpeed`           | 3      | 1/s   | Snappier turn-in                                           |
| `steerReturnSpeed`     | 5      | 1/s   | Faster self-centring                                       |
| `maxYawRate`           | 1.8    | rad/s | Tighter turns                                              |
| `yawResponse`          | 7      | 1/s   | Yaw follows the steering faster (lower = smoother, lazier) |
| `fullTurnSpeed`        | 8      | m/s   | More speed needed before steering is fully effective       |
| `highSpeedSteerLoss`   | 0.6    | —     | Less steering at high speed (0 = none, 1 = all)            |
| `lateralGrip`          | 6      | 1/s   | Less sliding, more "on rails"                              |
| `handbrakeDecel`       | 6      | m/s²  | Handbrake (without drifting) slows harder                  |
| `driftMinSpeed`        | 12     | m/s   | More speed needed to start a drift (~43 km/h)              |
| `driftExitSpeed`       | 8      | m/s   | Drift ends sooner when slowing down                        |
| `driftTurnRate`        | 1.5    | rad/s | Tighter drift line                                         |
| `driftTurnResponse`    | 3      | 1/s   | The drift line takes over from the entry turn faster       |
| `driftSteerInfluence`  | 0.4    | —     | Steering changes the drift line more                       |
| `driftAngle`           | 0.35   | rad   | More sideways with neutral steering (~20°)                 |
| `driftAngleSteerRange` | 0.18   | rad   | Steering changes the slip angle more (±10°)                |
| `driftRotateStiffness` | 3.5    | 1/s   | Nose swings to the drift angle faster                      |
| `driftDrag`            | 2      | m/s²  | Drifting costs more speed                                  |
| `driftExitGrip`        | 2      | 1/s   | Grip right after a drift (lower = longer "slide out")      |
| `driftRecoveryTime`    | 0.4    | s     | Slower return to full grip                                 |
| `spinDamping`          | 4      | 1/s   | External spin (kerb kicks, impacts) dies out faster        |

The dev tuning panel (F2, see [architecture.md](architecture.md#dev-tools)) edits all of these live.

## Resulting behaviour (measured with the values above)

| Metric                                                            | Value                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| Top speed                                                         | ~250 km/h                                              |
| 0–100 km/h                                                        | 1.9 s                                                  |
| Braking 100–0 km/h                                                | 12.5 m                                                 |
| Grip turn radius at 50 km/h                                       | ~8.6 m                                                 |
| Grip turn radius at 150 km/h                                      | ~34 m                                                  |
| Turn-in to 90% yaw at 100 km/h                                    | ~0.6 s                                                 |
| Drift radius at 150 km/h — steering into / neutral / countersteer | ~20 / ~28 / ~46 m                                      |
| Slip angle — into / neutral / counter                             | 30° / 20° / 10°                                        |
| Drift angle build-up to 90%                                       | ~0.7 s                                                 |
| Speed after 3 s full-throttle drift from 150 km/h                 | ~193 km/h (still accelerates, less than on a straight) |

At high speed drifting turns up to ~2× tighter than gripping, which is the point: it's the fast way
through tight corners. Values are a starting point, frozen after the feel pass (step 7).
