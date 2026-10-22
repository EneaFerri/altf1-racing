# Bot opponent

A local AI opponent, the blue car. Code in `01_packages/shared/src/ai/`, levels in
`01_packages/shared/src/config/bot.ts`. Pure and deterministic, so the future server can drive bots
with the same code.

## In game

- The bot starts on the grid next to the player (slot 1) on **Medium**.
- **B** cycles **Off → Easy → Medium → Hard → Off**. Off takes the car out of the race; switching it
  back on puts it at rest on the centreline 40 m behind the player. A level change keeps it where it is.
- The HUD strip ends with `● BOT MEDIUM` (dot in the bot's blue). The bot's lap and sector times are
  never shown (owner's choice): the timing HUD is the player's only.
- It is a real car: same physics, same collisions, same reset. Push it, block it, overtake it.
  On **Hard** it also drifts, and drives a slightly stronger car (+3% acceleration and top speed).

## How it drives

The bot only produces an `InputCommand` per tick, exactly like the keyboard, and `Game` passes it to
`stepGame` next to the player's. Nothing in the simulation knows a car is a bot. The only difference is
its car: `botCarParams` multiplies `engineAccel` and `maxSpeed` by the level's `performance`, passed to
the simulation through `SimContext.carParamsById` (any car can drive its own `CarParams`).

1. **Plan** (`ai/plan.ts`, `buildBotPlan`), built once per track and level, and again whenever the bot
   or car params change (live tuning). About 4 ms.
   - **Racing line**: start on the centreline and repeatedly move every point to the midpoint of its
     neighbours `lineSpan` (8 m) before and after, projected back on the sample's normal and clamped to
     `lineCut` of the half-width minus `edgeMargin` (3 m). Like a string pulled tight between the
     edges: outside → apex → outside, the lowest curvature the allowed width permits.
     (A first version simply shifted the line towards the inside of corners: that tightens the arc
     and was _slower_ with more cut.)
   - **Corner speed** from the car's own grip-mode yaw rate: at speed v the car turns at most
     `maxYawRate · (1 − highSpeedSteerLoss · v / maxSpeed)`, and following the line needs
     `v · curvature`. Solving the equality, scaled by `cornerSpeed`, gives the grip speed per point.
   - **Drift speed** (only with `driftUse` > 0): a drift turns the direction of travel at up to
     `driftTurnRate · (1 + driftSteerInfluence)` whatever the speed, so it can carry
     `driftUse ·` that rate `/ curvature`. Each point takes the faster of the two, capped at
     `topSpeed · maxSpeed`. All from `CarParams`, so retuning the car keeps the bot valid.
   - **No drift right after an opposite corner** (`driftZones`): a drift's turn blends in from the
     turn the car is already taking, so within `driftBuildDistance` (100 m) after a corner the other
     way (racing-line curvature above `oppositeCornerCurvature`, radius < 100 m) it builds too late and
     runs wide. There the plan uses grip speed only and the driver doesn't start a drift. Found on
     Kruncar (right-left esses, hairpins in a row): without it Hard hit walls; it costs 0.75 s on
     the Test Ring's chicane.
   - **Braking**: a backward pass round the loop limits each point to what `brakeUse · brakeDecel`
     can bring down to the next point's speed.
2. **Each tick** (`ai/driver.ts`, `botInput`):
   - **Steer** towards the racing-line point `lookAheadBase + speed · lookAheadTime` metres ahead,
     proportionally to the angle (`steerGain`), clamped to full lock.
   - **Pedals**: full throttle under the planned speed `speed · speedLookAheadTime` metres ahead,
     brake (proportional) when more than 1 m/s over it.
   - **Drift** (Space, like a player), decided on the speed the car really has: the corner
     `speed · driftLookAheadTime` metres ahead needs a turn rate of `speed · curvature`. If grip can't
     give it but a drift can (a drift never turns slower than `driftTurnRate · (1 − driftSteerInfluence)`),
     the bot enters with full lock into the corner, which locks the drift's side. A new drift is only
     started where the plan allows one (`driftOk`, below). Inside the drift it
     steers to make the direction of travel turn exactly as fast as needed, plus `driftAimGain` per
     radian towards the aim point, and it lets go once the corner needs less than `driftKeepShare` of
     the drift's slowest turn. (Planning drift zones in advance from the planned speed was tried first:
     whenever the bot was slower than planned, the drift turned too tight and it left the track.)
   - **Stuck**: slower than `stuckSpeed` (2 m/s) for `stuckSeconds` (2 s) → `reset: true`, the same
     R a player uses. The only memory (`BotMemory.stuckTicks`) is plain data kept by the caller.

## Levels (`BOT_PARAMS`, live in F2 → Bot)

| Param         | Easy | Medium | Hard | Meaning                                                      |
| ------------- | ---- | ------ | ---- | ------------------------------------------------------------ |
| `cornerSpeed` | 0.65 | 1.15   | 1.15 | × the corner speed estimated from the yaw rate               |
| `brakeUse`    | 0.55 | 1      | 1    | × `brakeDecel` used to plan braking (lower = brakes earlier) |
| `lineCut`     | 0.4  | 1      | 0.5  | Share of the usable width the racing line may use            |
| `topSpeed`    | 0.75 | 1      | 1    | × `maxSpeed` allowed anywhere                                |
| `driftUse`    | 0    | 0      | 1.1  | × the corner speeds planned for drifting (0 = never drifts)  |
| `performance` | 1    | 1      | 1.03 | × the car's `engineAccel` and `maxSpeed` vs the player's     |

- `cornerSpeed` above 1 is fine: the estimate ignores slip, so the car can really carry more.
- `driftUse` above 1 is fine too: the aim correction tightens the drift where the plan is optimistic.
- Hard uses _less_ width than Medium: a drifting car swings its tail wider, and with the full width
  it put wheels on the grass at corner exits. 0.5 is both the fastest and the cleanest measured.

## Measured behaviour (bot alone, baseline v1 car)

### Test Ring

| Level  | Lap    | Notes                                                                                         |
| ------ | ------ | --------------------------------------------------------------------------------------------- |
| Hard   | 28.6 s | Drifts, never a wheel off the asphalt (27.8 s before the no-drift-after-opposite-corner rule) |
| Medium | 34.1 s | Grip only, the whole width: the grip-only limit is ~33.2 s                                    |
| Easy   | 40.3 s | +18% on Medium                                                                                |

The owner's best lap is 29 s (with drifts): Medium is a calm opponent, Hard is faster than the owner
on purpose. Without its performance edge Hard would do 28.4 s; with +5% it does 27.4 s.

### Kruncar

| Level  | Lap    | Notes                                                     |
| ------ | ------ | --------------------------------------------------------- |
| Hard   | 45.0 s | The owner's target (~45 s); never a wheel off the asphalt |
| Medium | 50.3 s |                                                           |
| Easy   | 63.8 s |                                                           |

The Hard bot is sensitive to the layout: small changes to hairpin radii or widths put wheels on the
grass on some exits. The tests catch it; widen the exit or re-measure when editing a track.

Tests (`ai/bot.test.ts`): clean laps on every level of every track in `TRACKS`, lap-time bands, drift only on Hard, Hard never
off the asphalt, line inside the asphalt, recovery from a car parked on its line, stuck → reset,
determinism.

## Limits (for now)

No racecraft: it doesn't plan overtakes or avoid the player beyond following its line,
contacts are handled by the normal collisions. One bot; the code doesn't prevent more.
