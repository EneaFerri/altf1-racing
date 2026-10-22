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
  On **Hard** it drives a slightly stronger car (+3% acceleration and top speed) and takes shortcuts.

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
   - **Corner speed** from the car's own grip-mode yaw rate: at speed v the car turns at most
     `maxYawRate · (1 − highSpeedSteerLoss · v / maxSpeed)`, and following the line needs
     `v · curvature`. Solving the equality, scaled by `cornerSpeed` and capped at
     `topSpeed · maxSpeed`, gives the speed per point. All from `CarParams`, so retuning the car keeps
     the bot valid.
   - **Braking**: a backward pass round the loop limits each point to what `brakeUse · brakeDecel`
     can bring down to the next point's speed.
   - **Which road**: the plan is built on the road the bot drives (`BotPlan.road`): the main loop,
     or, with `shortcuts`, the route through the track's first branch (`Track.routes[0]`). The
     driver locates itself and aims on that road only.
2. **Each tick** (`ai/driver.ts`, `botInput`):
   - **Steer** towards the racing-line point `lookAheadBase + speed · lookAheadTime` metres ahead,
     proportionally to the angle (`steerGain`), clamped to full lock.
   - **Pedals**: full throttle under the planned speed `speed · speedLookAheadTime` metres ahead,
     brake (proportional) when more than 1 m/s over it.
   - **Stuck**: slower than `stuckSpeed` (2 m/s) for `stuckSeconds` (2 s) → `reset: true`, the same
     R a player uses. The only memory (`BotMemory.stuckTicks`) is plain data kept by the caller.

## Levels (`BOT_PARAMS`, live in F2 → Bot)

| Param         | Easy | Medium | Hard | Meaning                                                      |
| ------------- | ---- | ------ | ---- | ------------------------------------------------------------ |
| `cornerSpeed` | 0.5  | 1.15   | 1.15 | × the corner speed estimated from the yaw rate               |
| `brakeUse`    | 0.55 | 1      | 1    | × `brakeDecel` used to plan braking (lower = brakes earlier) |
| `lineCut`     | 0.4  | 1      | 1    | Share of the usable width the racing line may use            |
| `topSpeed`    | 0.75 | 1      | 1    | × `maxSpeed` allowed anywhere                                |
| `performance` | 1    | 1      | 1.03 | × the car's `engineAccel` and `maxSpeed` vs the player's     |
| `shortcuts`   | no   | no     | yes  | Drives the track's first branch (Kruncar's zigzag shortcut)  |

- `cornerSpeed` above 1 is fine: the estimate ignores slip, so the car can really carry more.

## Measured behaviour (bot alone, baseline v2)

### Test Ring

| Level  | Lap     | Notes                                                            |
| ------ | ------- | ---------------------------------------------------------------- |
| Hard   | 31.35 s | Medium's driving with the +3% car                                |
| Medium | 31.95 s | The whole width                                                  |
| Easy   | 38.15 s | +19% on Medium (`cornerSpeed` 0.5 since `maxYawRate` became 2.7) |

### Kruncar

| Level  | Lap     | Road                                                      |
| ------ | ------- | --------------------------------------------------------- |
| Hard   | 44.55 s | Zigzag shortcut (owner's target ~45 s); never a wheel off |
| Medium | 44.98 s | Wide road                                                 |
| Easy   | 56.58 s | Wide road                                                 |

Without drift the zigzag shortcut barely pays off for the bot: Hard is only 0.4 s ahead of Medium
on the wide road (its line keeps to the middle of the narrow zigzag).

When editing a track, re-run the bot tests: they catch a layout the bots can't lap cleanly (wheels on
the grass, walls) and the lap-time bands.

Tests (`ai/bot.test.ts`): clean laps on every level of every track in `TRACKS`, Hard alone on the
Kruncar shortcut, lap-time bands, Hard never off the asphalt, line inside the asphalt, recovery from a car parked on its line, stuck → reset,
determinism.

## Limits (for now)

No racecraft: it doesn't plan overtakes or avoid the player beyond following its line,
contacts are handled by the normal collisions. One bot; the code doesn't prevent more.
