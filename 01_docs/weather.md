# Weather (2.7)

Rain, chosen by a Grand Prix's manager in the lobby (owner, 2026-11-18). Generic: any track can
have it; offered first on **São Paulo** only, where real races are often wet. An overcast sky,
haze, a wet road and puddles, wet tyres and light falling rain (N switches the drops off). Dry everywhere unless chosen. Plan and steps in the
[roadmap](roadmap.md#27--weather-rain).

## Puddles (W.1)

`placePuddles(track)` (`shared/src/sim/weather.ts`) places a wet track's puddles once: the
simulation (from W.2) and the view read the same list, so a puddle you see is a puddle you feel.

- One candidate spot every `step` (40 m) of the main loop. Its chance: `baseChance` (0.1) on a
  straight, plus `bendChance` (25) × the tightest curvature within `bendWindow` (50 m) before or
  after it, up to `maxChance` (0.6): they gather round the corners (braking, apex, exit).
- Each is a flat ellipse along the track there, `halfLength` 1.5–3.5 m, `halfWidth` 0.8–1.8 m,
  lying wholly on the asphalt: at least `edgeClearance` (0.6 m) inside the kerb band.
- None on the grid (`gridBack`: 190 m before the start line, 20 slots 8 m apart) nor in the first
  `gridAhead` (30 m) after it.
- Deterministic: a seeded PRNG (Mulberry32 seeded by the track's name, FNV-1a), every spot drawing
  the same four numbers kept or not. Only the main loop is read: the same puddles with or without
  the pit lane (single player and the Grand Prix alike).
- Numbers: `PUDDLE_PARAMS` (`shared/src/config/weather.ts`, provisional).
- São Paulo (4.49 km): **42 puddles**, more than a third of them by a corner (tested).

## Look (W.1)

`view/weather/look.ts` derives the rain's look from any track's theme (`rainLook`); the rest of
the theme stays. `SceneView.setWeather(weather)` switches it live:

- **Sky**: grey, about as bright as the theme's (82% of its luminance, a slight blue cast): a day
  sky turns overcast, a night sky stays dark.
- **Haze**: the fog comes much nearer (40–900 m, never further than the theme's own).
- **Light**: 72% of the theme's, its colours 70% of the way to a cool grey; the sun at 25%.
- **Wet road**: asphalt, kerbs and painted lines multiplied by `#7c828c` (darker, cooler); grass,
  gravel and run-off by `#b2b9b2`.
- **Puddles** (`view/weather/puddles.ts`): one mesh, pixel blobs (`createPuddleTexture`: ragged
  edge, darker rim, a few glints) tinted with the overcast sky's colour so they mirror it, unlit,
  just above the edge lines (`Y_PUDDLE`), at the road's height on an elevated track. Built the
  first time it rains.
- **Rear lights** (owner, after W.1's test): every car's red rear lights lit, as in a night race,
  so the cars ahead show through the haze (`CarView.setRearLights`, switched live).

## Wet tyres and falling rain (W.2b)

The owner's wishes after W.2 (2026-11-18):

- **Wet tyres**: in the rain every car (the ghost too), whatever its livery, shows the wets' blue
  band on its wheels' sidewalls (`createWetSidewallTexture`: black rubber, a blue ring at 60–80%
  of the radius, a dark hub). The wheel is a cylinder whose two ends have their own material
  (`CarView.setWetTyres`); dry, they keep the tread's checker, as before.
- **Falling rain** (`view/weather/Raindrops.ts`): light, so the view stays clear. One
  `LineSegments` of 1500 light-grey streaks (2 m long, 80% opacity: the owner's values) in a
  60 × 30 × 60 m box that follows the camera (from 6 m below it up). The drops fall at 22 m/s,
  slanting 0.3 m sideways and 0.1 m back per metre of fall,
  and wrap round the camera **in the vertex shader** (`dropPosition` is the same formula in
  TypeScript, tested): one draw call, nothing updated per drop on the CPU. None within 3 m of
  the eye, fading in over the next 5 m (no streaks in the face, in either camera), and fading
  out towards the box's sides (no drop pops). Numbers: `RAINDROP_PARAMS`, live in F2 → Weather →
  Falling rain (all but the count).
- **N** switches the falling rain on or off on the own screen, in single player and online: the
  look only, the track stays wet.

## Physics (W.2)

`SimContext.weather` (`{ params, puddles }`, left out = dry) makes the track wet: in `stepGame`
each car's surface effect goes through `wetSurfaceEffect` (`shared/src/sim/weather.ts`) with
`puddleShare`, the share of its four wheels in a puddle (sampled where the surfaces are).

- Everywhere: lateral grip × `grip` (0.3: the car slides much wider), thrust and braking ×
  `traction` (0.95), braking × `brake` (0.59) on top: brakes at 56% of dry. On every surface, so
  wet grass and gravel are worse than dry.
- In a puddle, for its share of the wheels (two wheels in it = half): grip × `puddleGrip` (0.1),
  traction × `puddleTraction` (0.3), + `puddleDrag` (2.3 m/s²). All four wheels in one: 3% of the
  dry grip and 17% of the dry braking: a puddle is to be avoided, or crossed straight.
- `SurfaceEffect.brake` (new, 1 on every dry surface) multiplies only the brakes: a dry track
  drives exactly as before (every earlier test unchanged).
- Numbers: `WET_PARAMS` (`shared/src/config/weather.ts`): the owner's values (F2, 2026-11-18;
  grip 0.5 at first, then 0.3; W.2's first guess was 0.85 / 0.95 / 0.9 / 0.55 / 0.8 / 1.5), live in
  F2 → Weather.

Measured (`sim/weather.test.ts`, the owner's values):

| What                                     | Dry     | Wet      |                  |
| ---------------------------------------- | ------- | -------- | ---------------- |
| Braking 300 → 80 km/h                    | 116.8 m | 187.7 m  | +61%             |
| Slip after 1 s of full steer at 180 km/h | 21.5°   | 58.2°    | much wider       |
| Hard bot, São Paulo (best lap)           | 69.50 s | 86.28 s  | +24.1%, no walls |
| Medium bot                               | 70.72 s | 87.55 s  | +23.8%, no walls |
| Easy bot                                 | 81.25 s | 105.35 s | +29.7%, clean    |

The bot plans for the wet ([bot.md](bot.md#in-the-rain)); no walls, no resets, but Medium and
Hard slide wide onto the grass for about 8 s in three laps (the rain bot is a dev tool only:
online there are no bots).

## Online (W.3)

Protocol v15. The Grand Prix's manager chooses the weather in the **lobby**, for the whole GP:

- **Where**: only on the tracks in `RAIN_TRACKS` (`shared/src/config/weather.ts`, `offersRain`):
  São Paulo for now. Elsewhere the panel offers nothing and the server refuses the rain.
- **How**: in the lobby the manager presses **1** (dry) or **2** (rain): a `gp` command
  `{ action: 'weather', weather }` (validated by `parseClientMessage`). `GrandPrix` applies it
  only from the manager, only in the lobby, only where the track offers the rain; it is fixed
  from the start of qualifying on and kept after play again (the new lobby's manager may change
  it).
- **Everyone**: `GrandPrixInfo.weather` carries it; the server's room
  (`Room.setWeather` → `onlineSimContext(…, { weather })`) and each client's prediction
  (`Predictor.setWeather`) run the same wet track with the same puddles (placed by every machine
  from the track, never sent); the view switches live (`SceneView.setWeather`): sky, haze, wet
  road, puddles, rear lights, wet tyres, falling rain (N switches the drops off).
- **Panel**: the title ends with `· RAIN` in a wet GP (`· DRY` in such a lobby while dry); the
  manager's hint in the lobby: `1: dry · 2: rain · Enter: start the GP`.
- **Records**: wet laps go into the same lap records as dry ones (owner).
- Free practice is always dry (single player too, but for Test's `?rain` / F2 in dev).

## Variable weather, rain tyres, wet handling (2.8)

Owner, 2026-11-25: São Paulo's weather may turn during the race; intermediates and full wets at the
stops; on the right tyres a wet track drives harder than a dry one but much better than the old
model (grip 0.3 for everyone); slicks in the rain barely stay on the road; on the throttle mid-corner
in the wet the car slides round.

- **Forecast** (`config/weather.ts`): how wet the track is (0 dry … 1 soaked) at ticks of the
  simulation, linear in between (`wetnessAt`). Dry = `[{0, 0}]`, rain = `[{0, 1}]`. The sim reads it
  every tick (`trackWetness`), so server, predictions and the Mac agree to the tick.
- **Variable** (`WEATHERS`, the manager's 3 in the lobby; the single player's menu): `drawWeatherTurn`
  when chosen (and at play again): it starts dry and rain comes (to 0.55–1) or starts wet and
  dries. Until the race the track stays at the start; at the start lights `raceForecast` places the
  turn between 20% and 55% of the distance, over 1–2 laps (`FORECAST_PARAMS`, a lap reckoned at
  45 m/s). Sent in `GrandPrixInfo.forecast` (protocol v19).
- **Per compound** (`TYRE_PARAMS.wet`, curves at wetness 0 / 0.5 / 1; `tyreWetParams` →
  `wetSurfaceEffect`, its puddle share × wetness): grip slicks 1 / 0.45 / 0.22, intermediates
  1 / 0.86 / 0.66, full wets 1 / 0.92 / 0.8 (on dry grip 0.93 and 0.86 of a medium); traction,
  braking and aquaplaning likewise. Each compound is the best one in its weather.
- **Power oversteer** (`stepCar` `powerSlide`): on the throttle, turning harder than the tyres hold
  (speed × turn rate above `slideFrom`: full wets 80 → 60 m/s² from wetness 0.5 to 1, inters
  75 → 50, slicks 50 → 30; none dry), the rear steps out by the excess × `slideGain` (7/s > the
  spin damping 4/s, so it feeds itself into a spin, at most `slideMaxSpin` 3.5 rad/s); lifting stops
  it. The safety car never slides; the bots lift at 90% of it (`wetLift`).
- **Starts and wear**: on a wet track the cars start on the tyres it asks for (`startingTyres`:
  intermediates from 0.15, full wets from 0.6); rain tyres wear 3× / 4× faster on a dry track
  (`dryWear`, normal from 0.5).
- **Bots** (`BotSquad`): plans per tyre and quarter of wetness, built when first needed; a stop for
  the weather's tyres when theirs no longer suit it (`BOT_TYRE_SWITCH`).
- **Measured** (São Paulo, hard bot): dry 69.9 s; old web rain 86.3 s; full rain on full wets
  77.8 s, intermediates 80.6 s, slicks 115.4 s; damp (0.4) intermediates 73.8 s, slicks 82.2 s;
  dry on full wets 74.8 s. Full throttle at full lock on full wets in full rain: a spin (98° of
  slip at 35 m/s); lifting: a 50° slide.
- **Web look**: the rain's look from wetness 0.3 (`SceneView.setWetness`), the sidewall bands of
  every compound (inters green, wets blue). The Mac's: [macos.md](macos.md#rain-28).

## Dev

In single player **F2 → Weather (Grand Prix)**: rain on/off (or `?rain` in the URL) and the wet
params live; Copy as code includes `WET_PARAMS`. F3 shows `weather rain · n/4 wheels in a puddle`.
