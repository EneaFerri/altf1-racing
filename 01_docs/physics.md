# Car Physics

Arcade kinematic model in `01_packages/shared/src/sim/car.ts`, parameters in
`01_packages/shared/src/config/car.ts`. Pure and deterministic: `stepCar(car, input, params, dt)`
runs once per fixed tick (60 Hz) with the surface effect under the car (see [track.md](track.md))
and returns a new `CarState`. The tyres always grip: there is no drift (removed in step 9a.5, see
[decisions.md](decisions.md)). The brake only slows the car down.

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

| Field           | Meaning                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `id`            | Unique car id (`'player'`, `'bot'`, `'dummy'` in dev, later network players)                |
| `position`      | World position (m)                                                                          |
| `velocity`      | World velocity (m/s); may point away from `heading` while sliding                           |
| `heading`       | Facing angle (rad)                                                                          |
| `yawRate`       | Smoothed turn rate of the heading (rad/s), with inertia                                     |
| `spin`          | Extra rotation from external kicks (high kerbs, impacts), decays with `spinDamping` (rad/s) |
| `brakePressure` | 0..1, builds up while the brake is held, drops quickly once released                        |
| `steer`         | Smoothed steering −1..1                                                                     |
| `wheelSurfaces` | Surface under each wheel (FL, FR, RL, RR), sampled at the start of the last tick            |
| `slipstream`    | Tow from another car's wake in the last tick, 0..1 (see [Slipstream](#slipstream))          |

## Brake pressure

Space is the brake. How long it is held sets the pressure (`brakePressure`, kept in the state so the
server agrees, like the smoothed steering):

- Pressed: the pressure jumps to `brakeInitialPressure` (0.3), so a tap already slows the car, then
  ramps to 1 over `brakeRampTime` (0.6 s).
- Released: it drops to 0 over `brakeReleaseTime` (0.1 s).
- Deceleration = `brakeDecel · brakePressure` (× surface traction). The brake stops the car whichever
  way it rolls and **never reverses**.
- **S** (reverse key) asks for the same pressure while the car still rolls forward (> 0.3 m/s), then
  drives backwards (`reverseAccel`, up to `maxReverseSpeed`).
- `InputCommand.brake` and `.reverse` are 0..1: the pressure ramps up to that level, so a bot (or a
  future analog pedal) can ask for partial braking.

## Step by step

1. **Steering smoothing** — `steer` moves towards `input.steer` at `steerSpeed`, or `steerReturnSpeed`
   when releasing or switching side. Done in the Model so client and server agree.
2. **Split velocity** into `vF` (along `forward`) and `vL` (along `right`).
3. **Longitudinal (`vF`)**
   - Throttle: `vF += engineAccel · throttle · (1 − vF / maxSpeed) · dt`; if rolling backwards it brakes instead.
   - Brake: decelerates by `brakeDecel · brakePressure` towards 0 (see above), never reverses.
   - Reverse key: brakes the same way while `vF > 0.3 m/s`, then reverses (`reverseAccel`, capped at `maxReverseSpeed`).
   - No pedal: `coastDecel`. Always: air drag `airDrag · vF²` and the surface `drag`.
   - Thrust and braking are multiplied by the surface `traction`.
4. **Lateral grip** — `vL *= exp(−grip · dt)`, with `grip = lateralGrip · surface.grip`.
5. **Yaw** — target `−steer · maxYawRate · lowSpeed · highSpeed · sign(vF)`
   - `lowSpeed = min(1, |vF| / fullTurnSpeed)` → no turning on the spot.
   - `highSpeed = 1 − highSpeedSteerLoss · |vF| / maxSpeed` → calmer steering when fast.
   - `sign(vF)` → steering is inverted in reverse, like a real car.
   - **Yaw inertia**: the actual `yawRate` approaches that target exponentially,
     `yawRate += (target − yawRate) · (1 − exp(−yawResponse · dt))`. Combined with the steering ramp,
     turning in and out is progressive instead of a step on every key press (0.45 s to 90% at 100 km/h).
6. **Integrate** — `heading += (yawRate + spin) · dt` (wrapped to (−π, π]), velocity recomposed from `vF`/`vL`, `position += velocity · dt`.

Because velocity is recomposed in the _old_ frame and the car then rotates, part of the speed becomes
lateral on the next tick and grip pulls it back in line: a natural slip in turns, roughly
`yawRate / lateralGrip` (at full lock 30° at 50 km/h down to 21° at 150 km/h).

## Surfaces, spin and reset

- **Surface effect** (`sim/surface.ts`): before each `stepCar`, the four wheels' surfaces are averaged
  into `{ grip, traction, drag, spinKick }`. Values and rules: [track.md](track.md#surfaces-configsurfacests--surface_params).
- **Spin**: `spin = (spin + spinKick) · exp(−spinDamping · dt)`. It rotates the heading on top of
  steering; velocity is unchanged, so the car is knocked off-line and grip pulls it back. Impacts add
  spin too, bounded and non-stacking: see [collisions.md](collisions.md).
- **Reset** (`InputCommand.reset`, R): handled in `stepGame`, not `stepCar` — the car is placed at
  the closest centreline point, facing the driving direction, at rest (`createCar` with the same id).

## Slipstream

A car close behind another one at speed meets less air and gets towed along (step 10b). Model in
`sim/slipstream.ts`, values in `config/slipstream.ts` (`SLIPSTREAM_PARAMS`, F2 → Slipstream),
applied by `stepGame` to every car (player and bot alike).

- **Factor 0..1** (`slipstreamFactor`), from the positions at the start of the tick, the strongest
  wake among the other cars. In the leader's frame, three linear fades multiplied together:
  - **distance** behind it: 1 at `fullGap` (6 m, centre to centre ≈ nose to gearbox) → 0 at
    `range` (40 m): the closer, the stronger;
  - **side offset** from its axis: 1 on the axis → 0 at `halfWidth` (3 m);
  - **leader's speed**: 0 below `minSpeed` (25 m/s, 90 km/h: no wake at all) → 1 at `fullSpeed`
    (60 m/s, 216 km/h). The wake is made by the car ahead, so it is as strong as that car is fast.
  - No tow when the follower is alongside or ahead, or points more than `maxHeadingDiff` (45°) away.
- **Effect** (`slipstreamEffect`) in the speed update: air drag × `(1 − factor · dragCut)` (−45%
  at full tow) and, on throttle, `+ factor · towAccel` (1 m/s²). Drag alone isn't enough to be felt:
  the engine's thrust fades to 0 near `maxSpeed`, so −45% drag only gives ~305 km/h; the small push
  brings it to the owner's target, ~320 km/h.
- The factor is stored on the car (`CarState.slipstream`): the HUD (SLIP bar + %) and the wind lines
  read that one value (see [architecture.md](architecture.md)), and it travels with the state.

| Param            | Value | Unit | Higher means…                                  |
| ---------------- | ----- | ---- | ---------------------------------------------- |
| `range`          | 40    | m    | Tow felt from further back                     |
| `fullGap`        | 6     | m    | Full tow from further back                     |
| `halfWidth`      | 3     | m    | Wider wake, easier to stay in                  |
| `maxHeadingDiff` | π/4   | rad  | Tow still while angled to the leader           |
| `minSpeed`       | 25    | m/s  | Wake starts at a higher speed                  |
| `fullSpeed`      | 60    | m/s  | Full-strength wake only at a higher speed      |
| `dragCut`        | 0.45  | —    | Less air drag in the wake                      |
| `towAccel`       | 1     | m/s² | Stronger push in the wake (and top speed gain) |

Measured (full throttle from rest, constant tow, baseline v3 car):

| Tow  | 10 s     | 20 s     | Top speed |
| ---- | -------- | -------- | --------- |
| 0%   | 261 km/h | 282 km/h | 283 km/h  |
| 25%  | 267 km/h | 290 km/h | 291 km/h  |
| 50%  | 274 km/h | 298 km/h | 300 km/h  |
| 100% | 287 km/h | 317 km/h | 320 km/h  |

From 250 km/h, 3 s of full throttle: 268 km/h alone, 285 km/h at full tow.

## Parameters

| Param                  | Value  | Unit  | Higher means…                                              |
| ---------------------- | ------ | ----- | ---------------------------------------------------------- |
| `maxSpeed`             | 95     | m/s   | Higher engine limit (real top speed is lower, see below)   |
| `engineAccel`          | 18     | m/s²  | Punchier launch                                            |
| `brakeDecel`           | 30     | m/s²  | Shorter braking (at full pressure)                         |
| `brakeInitialPressure` | 0.3    | —     | A tap brakes harder                                        |
| `brakeRampTime`        | 0.6    | s     | Longer hold needed for full braking                        |
| `brakeReleaseTime`     | 0.1    | s     | Brake lingers longer after release                         |
| `reverseAccel`         | 8      | m/s²  | Faster reverse pickup                                      |
| `maxReverseSpeed`      | 10     | m/s   | Faster reverse                                             |
| `coastDecel`           | 1.5    | m/s²  | Car slows faster off the pedals                            |
| `airDrag`              | 0.0005 | 1/m   | Lower top speed, slower near the top                       |
| `steerSpeed`           | 3      | 1/s   | Snappier turn-in                                           |
| `steerReturnSpeed`     | 5      | 1/s   | Faster self-centring                                       |
| `maxYawRate`           | 2.7    | rad/s | Tighter turns                                              |
| `yawResponse`          | 9.5    | 1/s   | Yaw follows the steering faster (lower = smoother, lazier) |
| `fullTurnSpeed`        | 8      | m/s   | More speed needed before steering is fully effective       |
| `highSpeedSteerLoss`   | 0.6    | —     | Less steering at high speed (0 = none, 1 = all)            |
| `lateralGrip`          | 6      | 1/s   | Less sliding, more "on rails"                              |
| `spinDamping`          | 4      | 1/s   | External spin (kerb kicks, impacts) dies out faster        |

The dev tuning panel (F2, see [architecture.md](architecture.md), Dev tools) edits all of these live.

## Resulting behaviour (measured with the values above)

| Metric                                         | Value               |
| ---------------------------------------------- | ------------------- |
| Top speed                                      | ~283 km/h (v2: 250) |
| 0–100 km/h                                     | 1.85 s              |
| Braking 100–0 km/h (Space held from the start) | 17.9 m, 1.15 s      |
| Turn-in to 90% yaw at 100 km/h (full lock)     | 0.45 s              |
| Turn radius at full lock — 50 / 100 / 150 km/h | 5.7 / 12.7 / 21.8 m |
| Slip angle at full lock — 50 / 100 / 150 km/h  | 30° / 25° / 21°     |

These are **baseline v3** (final, the owner's reference setup): see [tuning.md](tuning.md). Top
speed and 0–100 are computed from the model for v3; the other rows were measured with v2, whose
only difference is `maxSpeed` (80), which barely affects them below ~150 km/h.
