# Car Physics

Arcade kinematic model in `01_packages/shared/src/sim/car.ts`, parameters in
`01_packages/shared/src/config/car.ts`. Pure and deterministic: `stepCar(car, input, params, dt)`
runs once per fixed tick (60 Hz) and returns a new `CarState`.

## Conventions

- **Units:** SI — metres, seconds, m/s, radians. The View converts to km/h (× 3.6).
- **Plane:** `Vec2 { x, z }` = the Three.js ground axes, so the View needs no conversion.
- **Heading:** radians, `0` = facing −Z, positive = counter-clockwise seen from above (turning left).
  `forward(h) = (−sin h, −cos h)`, `right(h) = (cos h, −sin h)`; in the View `rotation.y = heading`.
- **Steer:** `+1` = right (same as `InputCommand`), so steering right makes `heading` decrease.

## State

| Field      | Meaning                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| `position` | World position (m)                                                          |
| `velocity` | World velocity (m/s); may point away from `heading` while sliding           |
| `heading`  | Facing angle (rad)                                                          |
| `yawRate`  | Rotation speed applied in the last tick (rad/s), for View effects and drift |
| `steer`    | Smoothed steering −1..1                                                     |

## One tick, step by step

1. **Steering smoothing** — `steer` moves towards `input.steer` at `steerSpeed`, or `steerReturnSpeed`
   when releasing or switching side. Done in the Model so client and server agree.
2. **Split velocity** into `vF` (along `forward`) and `vL` (along `right`).
3. **Longitudinal (`vF`)**
   - Throttle: `vF += engineAccel · throttle · (1 − vF / maxSpeed) · dt`; if rolling backwards it brakes instead.
   - Brake: decelerates by `brakeDecel` while `vF > 0.3 m/s`, then engages reverse (`reverseAccel`, capped at `maxReverseSpeed`).
   - No pedal: `coastDecel`. Always: air drag `airDrag · vF²`.
4. **Lateral grip** — `vL *= exp(−lateralGrip · dt)`: sideways sliding dies out exponentially, frame-rate independent.
5. **Yaw** — `yawRate = −steer · maxYawRate · lowSpeed · highSpeed · sign(vF)`
   - `lowSpeed = min(1, |vF| / fullTurnSpeed)` → no turning on the spot.
   - `highSpeed = 1 − highSpeedSteerLoss · |vF| / maxSpeed` → calmer steering when fast.
   - `sign(vF)` → steering is inverted in reverse, like a real car.
6. **Integrate** — new heading (wrapped to (−π, π]), velocity recomposed from `vF`/`vL`, `position += velocity · dt`.

Because velocity is recomposed in the _old_ frame and the car then rotates, part of the speed becomes
lateral on the next tick and grip pulls it back in line: this gives a slight natural slip in turns.
The drift (step 3) builds on this by lowering grip.

## Parameters

| Param                | Value  | Unit  | Higher means…                                            |
| -------------------- | ------ | ----- | -------------------------------------------------------- |
| `maxSpeed`           | 80     | m/s   | Higher engine limit (real top speed is lower, see below) |
| `engineAccel`        | 18     | m/s²  | Punchier launch                                          |
| `brakeDecel`         | 30     | m/s²  | Shorter braking                                          |
| `reverseAccel`       | 8      | m/s²  | Faster reverse pickup                                    |
| `maxReverseSpeed`    | 10     | m/s   | Faster reverse                                           |
| `coastDecel`         | 1.5    | m/s²  | Car slows faster off the pedals                          |
| `airDrag`            | 0.0005 | 1/m   | Lower top speed, slower near the top                     |
| `steerSpeed`         | 4      | 1/s   | Snappier turn-in                                         |
| `steerReturnSpeed`   | 6      | 1/s   | Faster self-centring                                     |
| `maxYawRate`         | 2.2    | rad/s | Tighter turns                                            |
| `fullTurnSpeed`      | 8      | m/s   | More speed needed before steering is fully effective     |
| `highSpeedSteerLoss` | 0.5    | —     | Less steering at high speed (0 = none, 1 = all)          |
| `lateralGrip`        | 8      | 1/s   | Less sliding, more "on rails"                            |

## Resulting behaviour (measured with the values above)

| Metric                  | Value     |
| ----------------------- | --------- |
| Top speed               | ~250 km/h |
| 0–100 km/h              | 1.9 s     |
| 0–200 km/h              | 5.8 s     |
| Braking 100–0 km/h      | 12.5 m    |
| Turn radius at 50 km/h  | ~7 m      |
| Turn radius at 150 km/h | ~26 m     |

Values are a starting point; they get tuned live with the dev panel (step 3) and frozen in step 7.
