# Car damage (Phase 4)

**Grand Prix only.** Free practice, Time trial and single player never have damage. Plan and
steps: [roadmap.md](roadmap.md#phase-4--pit-lane-and-car-damage-grand-prix-only); choices:
[decisions.md](decisions.md#2026-11-04--phase-4-plan-damage-and-pit-lane-grand-prix-only).

## Model (4a)

`shared/src/sim/damage.ts` (pure, tested), numbers in `shared/src/config/damage.ts`
(`DAMAGE_PARAMS`, provisional until 4b/4i).

- **Parts**: `CarDamage` = `frontWing`, `rearWing` and `tyres` (four, in the order of `CAR_WHEELS`:
  front left, front right, rear left, rear right), each from 0 (as new) to 1 (fully damaged, the
  ceiling). Damage only grows; only the pits repair (4g). R (reset onto the track) keeps it.
- **Where it lives**: `CarState.damage`, **optional**: set only when the race has
  `SimContext.damage` (the Grand Prix, from 4d). Without it no car ever gets the field, so every
  other mode's state, snapshots and lap times are exactly as before. A car spawned or placed anew
  (`createCar`: the grid, the bot) starts without damage.
- **When**: in `stepGame`, after the collision pass and before lap timing: first the car's own
  impacts of the tick, then the wheels' surfaces.

### Impacts

`ImpactEvent`s (car or wall; the strongest per car and per thing hit, each tick), by closing speed
`strength`:

- Below `impactThreshold` (4 m/s) nothing: leaning on a car, scraping along a wall.
- Above it, `(strength − 4) × 0.025` to the part hit, chosen by the contact point in the car's
  frame (`hitZone`): more than `frontZone` (1 m) ahead of the centre = **front** (front wing,
  - half of it to each front tyre), more than `rearZone` (0.7 m) behind = **rear** (rear wing,
  - half to each rear tyre), in between = a **side** (60% to that side's two tyres, no wing).

Measured (Monza, straight at the wall across 10 m of run-off, closing speed at the hit):

| Run at the wall         | Closing speed | Front wing | Front tyres |
| ----------------------- | ------------- | ---------- | ----------- |
| 20 m/s, head-on         | 16.4 m/s      | 0.31       | 0.16        |
| 30 m/s, head-on         | 27.6 m/s      | 0.59       | 0.30        |
| 50 m/s, head-on         | 48.3 m/s      | 1.00       | 0.56        |
| 60 m/s, at 30°          | 28.9 m/s      | 0.62       | 0.32        |
| 80 m/s, at 15° (glance) | 20.0 m/s      | 0.40       | 0.21        |

### Off track

Each wheel on **grass** wears its tyre by `grassDamage` (0.03) per second, on **gravel** by
`gravelDamage` (0.08), in full from `offTrackSpeed` (30 m/s) on, proportionally slower, none at
rest. So a short trip over the grass costs little and a long one adds up: 5 s with four wheels on
grass at speed = 0.15 per tyre, 3 s in the gravel = 0.24. Kerbs (low and high) do nothing.

## Effects (4b)

From the tick after it is damaged, a car drives the worse for it. Two pure functions in
`sim/damage.ts`, applied by `stepGame` only with `SimContext.damage` (the car itself, baseline v3,
is untouched):

- **`damagedParams`**: the car's `CarParams` with less **top speed** (`maxSpeed`, so also less
  pull near it), **turning** (`maxYawRate`: understeer) and **grip** (`lateralGrip`: it slides
  wider). Each part costs, at full damage, a share of each; less damage costs proportionally less;
  the costs add up, but never below a **floor** (80% of top speed, 60% of turning, 50% of grip):
  a car always stays drivable and never retires.

  | Part (fully damaged) | Top speed | Turning | Grip |
  | -------------------- | --------- | ------- | ---- |
  | Front wing           | −4%       | −25%    | —    |
  | Rear wing            | −4%       | —       | −30% |
  | Tyres (average)      | −8%       | −10%    | −30% |

- **`damagedInput`**: uneven tyres **pull** to the more damaged side: steering added =
  (right tyres − left tyres) / 2 × `tyrePull` (0.12), within the steering range. The player
  counter-steers; the bot's line following corrects it by itself.

Measured: the Hard bot, its plan built for the damaged car, best of two timed laps (no new damage
during the run). Undamaged: the real pole, as calibrated.

| Damage                         | Monza          | Monaco         |
| ------------------------------ | -------------- | -------------- |
| None                           | 78.50 s        | 70.05 s        |
| Front wing 50%                 | 80.62 (+2.7%)  | 72.65 (+3.7%)  |
| Front wing 100%                | 83.13 (+5.9%)  | 75.95 (+8.4%)  |
| Rear wing 100%                 | 81.52 (+3.8%)  | 73.25 (+4.6%)  |
| Tyres all 50%                  | 81.10 (+3.3%)  | 72.68 (+3.8%)  |
| Tyres all 100%                 | 84.13 (+7.2%)  | 75.68 (+8.0%)  |
| Right tyres 100% (pulls right) | 81.07 (+3.3%)  | 73.17 (+4.5%)  |
| Everything 50%                 | 85.03 (+8.3%)  | 77.28 (+10.3%) |
| Everything 100% (the floors)   | 94.13 (+19.9%) | 89.65 (+28.0%) |

Fully damaged the bot touches walls (22 at Monza, 111 at Monaco, light: it slides wide), but never
gets stuck or resets.

**Trying it (dev only)**: single player, F2 → Damage (Grand Prix) → "on in single player" turns
it on for every car (the bot too); "Player's car" sets each part by hand, Repair zeroes them; the
params are live and in "Copy as code". F3 shows the damage (`FW · RW · tyres FL FR RL RR`, %).
Turning it off repairs every car. Production builds have no panel, so no damage.
