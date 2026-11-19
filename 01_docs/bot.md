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

The bot only produces an `InputCommand` per tick, exactly like the keyboard, and `SinglePlayerGame` passes it to
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
| `shortcuts`   | no   | no     | yes  | Drives the track's first branch (no circuit has one now)     |

- `cornerSpeed` above 1 is fine: the estimate ignores slip, so the car can really carry more.

## Measured behaviour (bot alone)

**Test Ring** is the tests' fixture (not in the game since step M.1): measured with baseline v2 and
frozen as it is; with v3 (`maxSpeed` 95) Medium laps it in ~29.6 s; no test checks its lap times.

### Test Ring

| Level  | Lap     | Notes                                                            |
| ------ | ------- | ---------------------------------------------------------------- |
| Hard   | 31.35 s | Medium's driving with the +3% car                                |
| Medium | 31.95 s | The whole width                                                  |
| Easy   | 38.15 s | +19% on Medium (`cornerSpeed` 0.5 since `maxYawRate` became 2.7) |

### Real circuits

Hard laps in the real 2025 pole time by construction (each circuit's scale is calibrated for it);
all levels' laps and sectors vs reality: [circuits.md](circuits.md).

| Level  | Monza (pole 78.79 s) | Barcelona (pole 71.55 s) | Monaco (pole 69.95 s) |
| ------ | -------------------- | ------------------------ | --------------------- |
| Hard   | 78.50 s              | 71.53 s                  | 70.05 s               |
| Medium | 80.03 s              | 72.77 s                  | 71.05 s               |
| Easy   | 93.30 s              | 82.85 s                  | 91.65 s               |

When editing a track, re-run the bot tests: they catch a layout the bots can't lap cleanly (wheels on
the grass, walls) and the real circuits' lap times.

Tests (`ai/bot.test.ts`): clean laps on every level of the Test Ring and every circuit of
`GP_TRACKS`, real circuits' lap times (Hard within 1.5% of the pole, sectors within 7%, Barcelona 10%), Hard never off the asphalt, line inside the asphalt, recovery from a car parked on its line, stuck → reset,
determinism.

## In the rain

On a wet track (dev only in single player: F2 → Weather) the bot plans with the wet brakes
(`brakeDecel` × wet traction × wet brake) and cornering yaw × √(wet grip) (`buildBotPlan`'s `wet`;
planning only, the simulation applies the wet itself). With the owner's `WET_PARAMS`, on São
Paulo: Hard 69.50 s dry, 86.28 s wet (+24%), no walls, no resets; Medium and Hard slide wide onto
the grass now and then ([weather.md](weather.md#physics-w2)).

- **The race** (S.5, `singleplayer/SinglePlayerGrandPrix.ts`): Singleplayer → Grand Prix → team
  → circuit → weather (only where it may rain). The online Grand Prix's own rules
  (`race/GrandPrix.ts`) on an `OfflineRoom` (the same simulation as online, the pit lane, damage
  from qualifying on): qualifying with the player alone (3 timed laps, Enter ends it), the bots
  already done with their class's flying lap measured on this circuit and weather
  (`botLapTicks`, ~0.4 s at load: Hard = the calibrated pole) × a random 1.000–1.010; the grid
  in that order with the same keys as online (1/2/3 = 4/8/12 laps, 4 + ←/→ + Enter), the F1
  start, the race with the mandatory stops and their penalty for everyone, then the podium and
  the classification (Race again: same team and circuit; Exit). The player is the only manager.
- **The bots** (`BotSquad`, `ai/squad.ts`): each drives in traffic (below) on its race plan and
  through the pit lane to its team's box when a stop is owed; held on the grid they don't count as
  stuck. **Boxes** (`teamBoxes`): one per team (teammates share it, as in F1) and one of the
  player's own, 6 of the 8 every circuit has; the second bot of a box stops a lap later (or
  earlier, never on the last two laps: `squadBots`), and a car never stops in a box still taken
  (`sim/pit.ts`: it drives on and comes back next lap). Measured (`race/offlineRace.test.ts`):
  10 cars, 4 laps of Monza, all finish, each with its stop and no penalty.
- **Points** (S.6, `race/points.ts`): F1's 25-18-15-12-10-8-6-4-2-1 to the first ten classified
  (`GRAND_PRIX.points`; a DNF none), also when the player ends the race early; the
  **constructors' standings** of that race add up each team's two drivers (a tie goes to the team
  with the better placed driver). At the end: podium → classification (with TEAM and PTS) →
  Constructors (each team's drivers and points, the player's team highlighted) → Race again /
  Exit. One race only: nothing is saved.
- **On screen**: the team colours, the bots' names above their cars and in the minimap legend,
  the GP panel (team colour, gaps, PIT/BOX, stops made/required), the start lights, the chequered
  flag; once the player is done the camera follows the best placed car still racing.

## In traffic

Step S.2 (for the single-player Grand Prix's 9 bots; the Test mode's bot sees the player too).
`botInput` also takes every car on track (`others`); alone on the track it drives exactly as
before (every measured lap time unchanged). Numbers in `BOT_DRIVER` (`config/bot.ts`).

- **Who is around**: the other cars within `trafficRange` (150 m) along the bot's road, with their
  gap along it, their offset from the centreline and their speed along it; a car off the road (in
  the pit lane) is not traffic.
- **Following** (`trafficSpeed`): a car ahead is in the way when it is closer sideways than
  `carWidth` (3.5 m: cars angled in a corner take more room) to the bot now, or to where the bot's
  line takes it by that car (a line sweeping across into a corner). The bot then carries at most
  the speed it can still brake from (`trafficDecel`, 22 m/s²) to that car's, counting on the car
  ahead slowing to the line's speed where it is (it is about to brake for a corner), before the gap
  shrinks to `followGap` + `followTime` × speed (6 m + 0.04 s); closer, slower than that car.
- **Passing** (`passOffset`): a car in the way within `passLookAhead` (18 m: the bot stays in the
  tow until then) and slower than the bot would go there on its own makes it move off its line
  (`passRate`, 4 m/s sideways) to the side with more room, one `carWidth` beside that car and
  `passEdgeMargin` (2 m) from the edge, unless a car alongside takes that side. Back to the line
  once nothing is in the way. A pass not done before a braking zone (the line's speed
  `passAbortTime` = 1.2 s ahead lower by `passAbortDrop` = 8 m/s) is given up.
- **Side by side** (`sideRoom`): the bot never aims into a car alongside (within `alongside`, 9 m):
  it keeps to its side, at least `carWidth` away, using the asphalt up to `squeezeEdgeMargin`
  (1 m) from the edge if squeezed. Into a braking zone the one just behind gives way
  (`yieldDrop`: 3 m/s slower than the other) and tucks in.

Measured (`ai/traffic.test.ts`): the 9 bots (4 Medium on the grid ahead of 5 Hard) over 3 laps.
Blind to traffic they touch tens of thousands of times (Monza ~80,000); now:

| Circuit   | Contacts strong enough to damage (> 8 m/s) | Overtakes                |
| --------- | ------------------------------------------ | ------------------------ |
| Test Ring | 0                                          | Hard past Medium         |
| Monza     | 2                                          | Hard past Medium         |
| Barcelona | 0                                          | Hard past Medium         |
| Monaco    | 5                                          | none (like the real one) |
| Mexico    | 11                                         | Hard past Medium         |
| Singapore | 3                                          | Hard past Medium         |
| Las Vegas | 5                                          | Hard past Medium         |
| São Paulo | 1                                          | none in 3 laps           |

A car held in its pit box (S.3) is still and off to the garages' side: it may be passed closer
(`parkedWidth`, 2.6 m), even into a braking zone, and a bot close behind it creeps on
(`creepSpeed`, 3 m/s) to steer round it.

Nobody gets stuck or resets. What is left is mostly lap 1 (the pack still together) and cars
sliding in the tightest hairpins (Mexico City's stadium).

## Pit stops

Step S.3, for the single-player Grand Prix's mandatory stops (`race/pitRule.ts`). The track is
built with its pit lane (`buildTrack(…, { pitLane: true })`) and the race's pit rules in
`SimContext.pit`, each bot with its own box.

- **The pit plan** (`buildPitPlan`, `ai/plan.ts`): the same racing line and speed profile, on the
  pit lane's route, with two more limits: `speedLimit` − 0.5 m/s between the limit lines, and half
  `PIT_PARAMS.boxSpeed` over the last metres before its box, so it is slow enough there for the
  stop to begin by itself (`sim/pit.ts`: held, then released as new). The braking pass makes it
  slow down in time for both, like for a corner.
- **When** (`ai/pitPlan.ts`): `pitSchedule(raceLaps)` spreads the `requiredStops` evenly, stop `j`
  due once `floor(j · laps / (stops + 1))` laps are done (5 laps: after lap 2; 8 laps: 2 and 5;
  24 laps: 4, 9, 14, 19); `pitDue` says whether one is owed now. The caller drives the bot on its
  pit plan while a stop is owed and on its race plan otherwise, switching only where both roads
  are the same (`canSwitchPlan`: not between the pit entry and exit, 30 m either side), so the
  bot takes the pit lane at the next entry and comes back to its line after the exit.
- Held in its box (or still in the lane after the stop) a bot is never "stuck" (no reset).

Measured (`ai/pitPlan.test.ts`): a Hard bot over 5 laps stops on lap 2 and finishes on every
circuit, without touching a wall or resetting; three Hard bots in a row (boxes 7, 0, 3) pitting
on the same lap all stop once and finish, at most grazing the lane's wall while getting round a
car in its box.

## Limits (for now)

No defending, no dive-bombs: a bot passes only where it is clearly faster, and gives way side by
side into a corner. Contacts are handled by the normal collisions.

## Single-player Grand Prix

Plan (owner, 2026-11-19; roadmap section S): single player's Grand Prix against 9 bots in 5 teams.

- **Teams** (`config/teams.ts`, `TEAMS`, strongest first): Mercedes (Russell, Antonelli), Ferrari
  (Leclerc, Hamilton), Red Bull (Verstappen, Hadjar), McLaren (Norris, Piastri), Polimi (IngConti,
  Margara: the university's team). Real line-ups, owner's choice; correct them there.
- **Lineup** (`race/teams.ts`, `teamLineup`, S.1): the player picks a team and takes the seat of
  one of its two drivers, drawn at random; the teammate stays. The 9 bots, ranked by team strength
  (Mercedes > Ferrari > Red Bull > McLaren > Polimi) then driver order, are **Hard** for the first
  5 and **Medium** for the other 4 (`BOT_CLASS_COUNTS`): so Red Bull has Verstappen Hard and Hadjar
  Medium unless the player is at Mercedes, Ferrari or Red Bull.
- **Colours** (`TEAM_LIVERIES`, `view/pixelTexture.ts`): the body colour with the team's stripe
  colour (`Livery.accent`): Mercedes silver and teal, Ferrari red and yellow, Red Bull dark blue and
  red, McLaren papaya and black, Polimi blue and white with its sponsor "OF" in pixel letters under
  the stripe (`Livery.sponsor`, `sponsorPixels`).
