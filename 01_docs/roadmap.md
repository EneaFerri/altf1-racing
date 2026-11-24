# Roadmap

## Phase 0 — Scaffolding ✅

- Monorepo, tooling, docs, pixel-textured cube rendering in the browser.

## Phase 1 — Single-player ✅

Goal: a drivable, fun car (arcade grip handling) with chase + first-person cameras, an F1-style
timing HUD and live tuning; then a bot opponent and real-inspired tracks. All game logic lives in
`shared` (deterministic). Workflow: one step at a time → owner review → commit after OK.

Done (details in the linked docs; superseded designs in [decisions.md](decisions.md)):

1. ✅ **Game loop + Controller + debug overlay** (F3) — [architecture.md](architecture.md).
2. ✅ **Car physics + chase camera** — [physics.md](physics.md).
3. ✅ **Dev tuning panel** (F2, Copy as code) — [tuning.md](tuning.md).
4. ✅ **Test Ring, surfaces, kerbs, reset (R), collisions, dev dummy car** (F4) —
   [track.md](track.md), [collisions.md](collisions.md).
5. ✅ **Cameras** — chase / first person with cockpit (V), speed FOV — [architecture.md](architecture.md).
6. ✅ **Laps + HUD** — free practice, 3 sectors, validity — [laps.md](laps.md).
7. ✅ **Feel pass** — first tuning baseline (v1).
8. ✅ **Bot opponent** (Easy / Medium / Hard, B) and **track menu** (8b) — [bot.md](bot.md).
9. **Tracks**, each in `TRACKS` with layout tests, its `track.md` section, sector gantries, a bot
   that laps it cleanly:
   - 9a ✅ **Kruncar** — layout (9a.1), Krunker look and scenery (9a.2, [themes.md](themes.md)),
     fork with a wooden zigzag shortcut (9a.3).
   - 9a.4–9a.5 ✅ **Brake and handling (owner feedback)** — Space = brake with pressure, S = reverse;
     drift tried from braking, then removed: grip-only handling. Frozen as **baseline v2 (final)**,
     the owner's reference setup (git tag `baseline-v2`).
   - 9b–d **Monza, Barcelona, Monaco** — the real circuits from open data (OpenF1 times and sectors,
     OpenStreetMap shape, published widths), scaled so the Hard bot laps in the real pole time
     ([circuits.md](circuits.md)); then their scenery from OpenStreetMap ([themes.md](themes.md)).
     - 9b ✅ **Monza** — with the tool (`01_tools/openf1/`) and per-track widths and sectors;
       9b.2 ✅ scenery: real grandstands, pit lane and buildings, woods, the old oval, armco.
     - 9c ✅ **Barcelona** — circuit; 9c.2 ✅ scenery: Mediterranean look, real grandstands, pit
       lane and buildings, pines in the real woods.
     - **Baseline v3** (final): `maxSpeed` 80 → 95, owner's choice; tracks and bots unchanged.
     - 9d ✅ **Monaco** — circuit (width × 1.2: overtaking as hard as in reality); 9d.2a ✅ the town
       and the sea (buildings with real heights, Port Hercule, pools, palms, tunnel, catch fences);
       9d.2b ✅ the icons: yachts in Port Hercule, the Casino, Sainte-Dévote, the hills.
10. **Race-craft: look back + slipstream** — one sub-step each, owner review after each:
    - 10a ✅ **Look back (Z)** — hold Z to look behind the car, release to return. View only: a held
      `lookBack` key in `controller/bindings.ts` that never reaches the simulation; `CameraRig`
      turns the active camera 180° (chase: camera in front of the car looking back; first person:
      eye looking backwards, cockpit hidden), instant flip, speed FOV unchanged. Works in both
      camera modes; tests in `CameraRig.test.ts`.
    - 10b ✅ **Slipstream** — close behind a car at speed, less
      air drag (−45%) and a small tow push: top speed 283 → 320 km/h at full tow. Stronger the
      closer (full at 6 m, none past 40 m) and the faster the leader (none below 90 km/h, full from
      216 km/h). In `shared` (`sim/slipstream.ts`, `SLIPSTREAM_PARAMS`, F2 → Slipstream), for every
      car, so the bot gets a tow too. Shown by a SLIP bar + % in the HUD and light wind lines on the
      screen edges, both from the same value (`CarState.slipstream`) — [physics.md](physics.md#slipstream).
      Baseline v3 untouched: a car alone drives as before, real-circuit pole times still hold.

Out of scope for Phase 1: audio, menus beyond the track menu, gamepad, networking.

## Phase 2 — Multiplayer (current)

Design and rules: [multiplayer.md](multiplayer.md). Same workflow: one sub-step → owner review → commit.

### 2.1 — Mode menu, lobby with nicknames, two players on the Test Ring

Goal: the start screen offers **Singleplayer / Multiplayer**. Singleplayer is today's game (track
menu, bot), fully separate from the network. Multiplayer asks for a **nickname** (unique among the
players online), then drops the player on the **Test Ring**; everyone who joins lands on the same
track and drives freely. Done when two players on two machines (Tailscale) drive together.

- 2.1a ✅ **Mode menu + separation** — `ModeMenu` (same look and keys as the track menu):
  Singleplayer → track menu → the current game, moved to `client/src/singleplayer/` unchanged;
  Multiplayer → a placeholder screen. `client/src/multiplayer/` created, each mode loaded by dynamic
  import only when chosen, and an ESLint rule that forbids imports between the two folders.
- 2.1b ✅ **Protocol + nickname rules** — `shared/src/net/`: typed JSON messages with a protocol
  version, and the pure nickname check (3–16 characters, letters, digits, space, `_`, `-`;
  unique case-insensitively), tested.
- 2.1c ✅ **Server lobby** — `01_packages/server` (Node + `ws`, TypeScript run directly):
  nicknames reserved while connected and freed on disconnect, rejections (taken / invalid / full /
  old version); `npm run server`; Vite proxies `/ws` to it so the page and the socket share one origin.
- 2.1d ✅ **Client lobby** — nickname screen: type, connect, enter or see the reason inline (taken,
  invalid, full, server unreachable); the last nickname is remembered on that browser.
- 2.1e ✅ **Server room** — the Test Ring simulated by the server at 60 Hz with each player's latest
  input; a joining car spawns on a free grid slot, a leaving one is removed; snapshots at 30 Hz.
  Cap: 8 players. No bots.
- 2.1f ✅ **Online game** — once the nickname is accepted, straight onto the Test Ring (no lobby list):
  the client sends its input every tick and plays the snapshots back ~67 ms behind, interpolated
  (no prediction yet); camera on its own car, HUD with its own laps, a livery per player and
  nickname tags over the other cars. Esc → back to the start screen.
- 2.1f+ ✅ **Choice of circuit** (owner's addition) — after the nickname, a track menu with the three
  F1 circuits (Monza, Barcelona, Monaco) and how many players are on each; everyone who picks a
  circuit drives together in its room, live as soon as its first player enters, closed when the last
  one leaves (protocol v2: `enter` / `entered`). Replaces 2.1e's single Test Ring room.
- 2.1g ✅ **Two players over Tailscale** — owner test with friends on several machines: everyone
  drives together, but the own car's lag and delay are too high (it waits for the server's
  snapshots) → 2.2. Written down in [multiplayer.md](multiplayer.md#two-machines-21g-).

### 2.2 — Client-side prediction: the own car responds instantly

Goal: a key press moves the own car on the same frame, as in single player. The client predicts
its own car with the same `stepGame` the server runs and reconciles it with every snapshot; the
other cars stay smooth. Design: [multiplayer.md](multiplayer.md#prediction-22).

- 2.2a ✅ **Input sequence numbers, server input queue, acks, ping** (protocol v3) — every input
  carries a `seq`; the server runs exactly one queued input per player per tick and tells each
  snapshot which `seq` it ran last; `ping`/`pong` measures the round trip (F3). Infrastructure
  only: driving feels the same.
- 2.2b ✅ **Own car predicted and reconciled** — the visible win: instant response, small server
  corrections smoothed out, big ones snapped (`multiplayer/Predictor.ts`; the snapshot playback
  `SnapshotBuffer` removed).
- 2.2c ✅ **Other cars in the prediction** (protocol v4) — snapshots carry each car's last input;
  the other cars are predicted with it, so contacts and tow with them are predicted too and they
  are drawn where the own car can touch them, corrections gliding in.
- 2.2d ✅ **Owner test over Tailscale again** — done (owner, 2026-10-28).

### 2.2+ — Minimap ✅

Bottom-left in both modes: the whole track from above, a dot per car in its livery colour, a
legend colour → name. Details: [architecture.md](architecture.md#view--01_packagesclientsrcview).
Same step: grandstands beside bends drawn in pieces that follow the track
([themes.md](themes.md)).

### 2.3 — Online game modes: Free practice · Time trial · Grand Prix

Online only (owner's choice): single player stays as it is. After the nickname the player picks a
**mode**, then one of the three F1 circuits (Monza, Barcelona, Monaco):

- **Free practice** — today's room: everyone on the circuit laps freely.
- **Time trial** — alone on the circuit; the first timed lap is normal, from the second on the
  player races their **ghost** (the session's best valid lap, updated lap by lap).
- **Grand Prix** — the first player in is the **GP manager** and starts it when ready: qualifying
  (3 timed laps each, Q1/Q2/Q3, no elimination) → grid from the best times → race of 4/8/12 laps
  (manager's choice) → podium and classification → each player plays again (a new lobby on the
  same circuit) or exits. Anyone arriving while a GP runs is told "GP in progress".

Owner's choices: time trial alone (private session); in a GP a car that has finished (qualifying
or race) leaves the track and its player spectates; the manager can end qualifying or the race
early (a disconnected player is DNF); standing start with F1 lights. Design:
[decisions.md](decisions.md#2026-10-28--online-game-modes-step-23-plan).
Out of scope: joining a running GP as a spectator, several GPs per circuit, time-trial
leaderboards, bots online.

- 2.3a ✅ **Starting grid drawn** (view only) — F1-style boxes at each `gridSlot` (the spawn poses),
  20 slots, on the three F1 circuits only (Test Ring and Kruncar are frozen).
- 2.3b ✅ **Mode menu + protocol v5** — nickname → mode menu → track menu → room; rooms keyed by
  mode + circuit (`practice/Monza`). Only Free practice is offered (today's behaviour); Time trial
  and Grand Prix are listed, dimmed, as "Work in progress".
- 2.3c ✅ **Time trial: private session** — one room per player (`timeTrial/Monza/p3`), the
  circuit menu counts everyone driving it; normal timing, no bot. A private room is only a
  different room key (`PRIVATE_MODES` in `GameServer.ts`).
- 2.3d ✅ **Ghost** — the own car's best valid lap recorded tick by tick and replayed as a
  see-through car in its livery, in step with the current lap (client only: `multiplayer/ghost.ts`,
  `SceneView.setGhost`).
- 2.3e ✅ **GP: lobby and manager** — free driving while waiting, players list, manager starts the GP
  (handed over if they leave); later arrivals refused with "GP in progress".
- 2.3f ✅ **GP: qualifying** — everyone back on the grid, out-lap + Q1/Q2/Q3, live timing tower,
  done → spectate; the manager can end it (no time → back of the grid). No hold before it (planned
  at first): it starts with an out-lap, so nobody gains from going first.
- 2.3g ✅ **GP: grid and F1 lights** — grid from qualifying, the manager picks 4/8/12 laps; cars held
  until lights out by a hold both the server and the prediction apply (`shared/src/race/`).
- 2.3h ✅ **GP: race** — position and lap in the HUD, gaps tower (timed at every timing line),
  finish → spectate, DNF; the manager can end it. Owner's addition: no F3 telemetry overlay in a
  Grand Prix (it overlapped the race panel).
- 2.3i ✅ **GP: podium, classification, play again** (protocol v9) — podium for 20 s (Enter skips):
  swaying pixel drivers in their livery colours on three steps, the winner with the cup; then the
  classification card (gap to the winner, fastest lap each, the race's fastest in purple) with
  Play again / Exit. Owner's change to the plan: no manager close — the first Play again opens a
  new lobby on the circuit (its manager), the others join it; Exit goes back to the start.
- 2.3j ✅ **Owner test over Tailscale** of all three modes (owner, 2026-11-03).
- 2.3k ✅ **Chequered flag marshal** (owner's request, 2026-11-04) — from the first driver on the
  last lap until the results, a pixel-art flag marshal (team jacket, ponytail) waves the
  chequered flag on a small podium at the finish line, on the side away from the pits; Grand Prix
  only.
- 2.3l (awaiting the owner's test) **Grand Prix sector timing, F1 style** (owner, 2026-11-18;
  protocol v15) — the server keeps each session's (lobby, qualifying, race) best time of every
  sector over all drivers, live at every sector done (`GrandPrixInfo.sectorBests`); the HUD shows a table under the strip:
  this lap's sector times and the own bests, purple (fuchsia) = the session's best of everyone
  (live: beaten by another, it turns green), green = own best, yellow = slower
  ([laps.md](laps.md#grand-prix-sector-table-23l)). The panel top left marks the session's fastest
  lap: a purple stopwatch and its time beside its driver. Other modes unchanged.

### 2.4 — More circuits

Goal: more real F1 circuits, **one per step**, each playable in **every mode**: single player
(track menu, bot) and multiplayer (Free practice, Time trial, Grand Prix). Built like Monza,
Barcelona and Monaco with the OpenF1 + OSM tool ([circuits.md](circuits.md)) and the same rules:
shape from OSM, real widths × a width factor (the owner's choice per circuit), only normal kerbs,
the Hard bot laps in the real 2025 pole time with the frozen car (baseline v3). Every step follows
the checklist in [circuits.md](circuits.md#adding-a-circuit); the online circuits are one list,
`GP_TRACKS` (shared), so a circuit added there appears in every mode.

- 2.4a ✅ **Mexico City** (Autódromo Hermanos Rodríguez) — OSM relation 16251935, 2025 pole 1:15.586
  (OpenF1 session 9873); real widths × 1.4 (owner's choice); oriented by the owner's
  `Mexico carbon.png`; OSM scenery plus the Foro Sol stadium (turns 12–16). Same step: `GP_TRACKS`,
  the one list of the online circuits. Widths measured on OSM's asphalt areas (none published);
  Hard bot 75.48 s, clean on every level; garages beside the pit lane where OSM maps none. Owner's
  first test: the 90° corners made sharp (you must brake), the stands made coherent (stadium bowls,
  the GP's grandstands at the corners), the surroundings drawn (park buildings, domes, lakes,
  volcanoes).
- 2.4b ✅ **Monaco: one only, with its heights** (owner, 2026-11-17) — the flat Monaco removed,
  Phase 3's Monaco v2 renamed **Monaco** (`layouts/monaco.ts`, `themes/monaco.ts` +
  `monacoLand.ts`, regenerated identical to v2's); in `TRACKS` and `GP_TRACKS` where the flat one
  was. The tool's `data` field (v2 borrowing Monaco's data) removed. Protocol v14; the server's lap
  records: v2's moved under Monaco (flat Monaco had none)
  ([elevation.md](elevation.md#one-monaco-24b-)).

Next three circuits (owner's plan, 2026-11-17; [decisions.md](decisions.md)), one after the
other, each: data → circuit → look and scenery → owner's test and OK → commit. Before each step
the owner adds the circuit's PNG to `03_F1Circuits/` and picks its width factor.

- 2.4c ✅ **Singapore** (Marina Bay) — flat, at night. Pole 2025 (Russell 1:29.158, to confirm on
  OpenF1).
  - c.1 ✅ Data, layout (the 2023+ layout: a straight where turns 16–19 were), calibration on the
    pole, pit lane (previews against the PNG). Widths estimated from OSM's lane counts × 1.2
    (owner); scale 1.048, Hard bot 89.20 s (pole 89.158), every level clean; pit lane on the left,
    joined at the track's edge. In every mode, with a plain daylight theme until c.2–c.3. Same
    step: `WIDTH_FACTOR` 1.6 → **1.4** for new circuits (owner; Monza and Barcelona keep 1.6), the
    tool reads OSM's `pitlane` role and opens lasting folds wider
    ([circuits.md](circuits.md#singapore-layoutssingaporets-step-24c)).
  - c.2 ✅ **Night look** — `night` in the real-circuit look: navy sky with stars, dark fog, the
    ground darkened (`ground.tint`), the track bright under floodlight poles behind the walls
    (instanced, emissive lamps; no light source per lamp). Lit windows come with the town (c.3).
    Built on Singapore, reused by Las Vegas ([themes.md](themes.md#night-races-realcircuitlooknight-step-24c2)).
  - c.3 ✅ **Town and landmarks** (owner's test: approved, 2026-11-17) — a town circuit from OSM within 700 m
    (`townReach`): ~1200 buildings with real heights and lit windows at night, Marina Bay and the
    river (inland water, cut where the track crosses it on a bridge), palms; the Singapore Flyer,
    Marina Bay Sands with its SkyPark, the Esplanade's durians; six grandstands by hand. Owner's
    addition: the cars' red rear lights in night races (crash structure and endplates). Tool:
    inland water, `building_passage` is no tunnel, a landmark whose building is left out stands
    on the nearest one or alone on its POI ([themes.md](themes.md#town-circuits-circuitconfigtown-monaco-singapore-las-vegas)).
- 2.4d ✅ **Las Vegas** (Strip Circuit) — flat, at night (c.2's look).
  - d.1 ✅ Data and layout; target the **2024 pole** (Russell 1:32.312: the
    2025 qualifying was wet; `year` in `circuits.ts`); widths from OSM's lane counts × 1.4;
    scale 0.945, Hard bot 92.27 s, every level clean; pit lane on the left, joined at the edge.
    In every mode, with the night look already (no town yet)
    ([circuits.md](circuits.md#las-vegas-layoutslasvegasts-step-24d)).
  - d.2 ✅ **The Strip and its landmarks** (owner's test: approved, 2026-11-17) — a town circuit from OSM within
    500 m: ~600 hotels and casinos with real heights and lit windows; the owner's four landmarks:
    the Sphere (a pixel Earth), Paris's Eiffel Tower, the Fountains of Bellagio, the Stratosphere
    2.5 km to the north (lit pod and beacon over the fog); five grandstands by hand. Tool: a
    landmark is never too far (`osmWay` fetches it anywhere), a water area can be one
    ([themes.md](themes.md#town-circuits-circuitconfigtown-monaco-singapore-las-vegas)).
- 2.4e **São Paulo** (Interlagos) — **with its real heights**, like Monaco
  ([elevation.md](elevation.md)). Pole 2025 (Norris 1:09.511, confirmed on OpenF1).
  - e.1 ✅ Tool: the land's dataset per circuit (`dem`: EU-DEM covers Europe only, SRTM 30 m for
    Brazil); data, elevation report: 43.0 m of height difference, as published
    ([elevation.md](elevation.md#são-paulo-24e)).
  - e.2 ✅ Layout with heights, widths from OSM's asphalt areas × 1.4, scale 1.048, Hard bot
    69.50 s, every level clean; pit lane on the left, 1350 m, joined at the edge and smoothed
    (`pitLaneSmoothing`). In every mode, with a first day look on the real land
    ([circuits.md](circuits.md#são-paulo-layoutssaopaulots-step-24e)).
  - e.3 ✅ Scenery on the real land: the town round the park (~3000 OSM buildings on the
    slopes), the lake by the Descida do Lago at its own level (the only one OSM maps within
    reach; it lies outside the lap), five grandstands by hand round the lap
    ([themes.md](themes.md#são-paulo-theme-themessaopaulots-step-24e)). Awaiting the owner's test.

After 2.4e: more circuits whenever the owner wants one.

### 2.5 — Lap records

Goal: the best laps kept on the server for good, per mode and circuit, shown before choosing one.
Design: [multiplayer.md](multiplayer.md#lap-records-25a).

- 2.5a ✅ **Lap records in SQLite** (protocol v10) — the server keeps, per record mode (Time trial,
  Grand Prix: qualifying and race) and circuit, the 10 fastest players' best valid laps
  (`node:sqlite`, `server/data/records.db`); the `welcome` carries them and the track menu shows
  the selected circuit's top 10, the own time marked.

### 2.6 — Netcode on weak connections

Goal: the game stays playable over Tailscale for players on a weak connection (jitter, lost
packets, little bandwidth). Design: [multiplayer.md](multiplayer.md#rooms-21e--21f-).

- 2.6a ✅ **Input timeline with a jitter buffer** — the server runs one `seq` slot per tick, a
  missing input repeats the last one and uses its slot up, and its buffer adapts by one tick at a
  time: network stalls no longer throw the own car forward and back (measured on the simulated bad
  network: jumps of up to 11 ticks before, 1 tick now). Dev: `NET_DELAY_MS`/`NET_JITTER_MS`/
  `NET_STALL_MS` simulate a bad network on the server. Protocol unchanged (v13).
- 2.6b ✅ **Lighter snapshots** — a snapshot was ~6.4 KB (8 cars, Grand Prix), ~1.5 Mbit/s per
  client at 30 Hz. Now numbers rounded to 4 decimals (`quantizeState`, applied by the server to its
  own state so the prediction stays exact) and `perMessageDeflate` on the socket: ~0.3 KB on the
  wire, ~20× less for the clients and the host. Protocol unchanged (v13).
- 2.6c ✅ **Smoother opponents** — the other cars' corrections glide unless bigger than what the
  car covers in 0.35 s (was a fixed 4 m: a late snapshot made a car at speed teleport), and fade
  slower (6/s instead of 10/s); the own car unchanged.

### 2.7 — Weather: rain

Goal (owner, 2026-11-18): a rain mode any track can have, tried on **São Paulo**: the Grand
Prix's manager chooses dry or rain in the lobby (keys 1/2), for the whole GP. No raindrops: grey
sky, haze, wet road, puddles that take grip; a little less grip in corners and a little less
braking everywhere. Wet laps count in the same lap records. Rain in single player: dev only.
Later (owner): wet tyres and light falling rain after all (W.2b).
Design: [weather.md](weather.md).

- 2.7 W.1 ✅ **Wet look, dev only** — `placePuddles` (shared, pure,
  deterministic: the same puddles for the simulation and the view, 42 on São Paulo), the rain's
  look from any theme (overcast sky, near haze, dim light, darker wet road, puddles mirroring the
  sky), switched live by `SceneView.setWeather`. Dev: F2 → Weather, or `?rain`. Physics still dry.
  Owner's test: fine; added the cars' red rear lights in the rain, for visibility.
- 2.7 W.2 ✅ **Wet physics, dev only** — `SimContext.weather`: lateral grip, traction and brakes
  scaled (`SurfaceEffect.brake`), puddles under each wheel taking far more; dry unchanged. The
  owner's values (`WET_PARAMS`: grip 0.3, brakes at 56%, a puddle 3% grip): braking 300→80 km/h
  +61%, the car slides much wider, Hard bot on São Paulo +24% (it plans for the wet). F2 sliders,
  F3 puddle wheels ([weather.md](weather.md#physics-w2)).
- 2.7 W.2b ✅ **Wet tyres and falling rain** — in the rain every car on
  wets (the blue band on the sidewalls, whatever the livery); falling rain (the owner's look: 2 m
  streaks at 80% opacity, 22 m/s, slanted), 1500 streaks
  round the camera moved in the vertex shader (one draw call), none in the face; N switches the
  drops off on the own screen ([weather.md](weather.md#wet-tyres-and-falling-rain-w2b)).
- 2.7 W.3 (awaiting the owner's test) **Rain in the online Grand Prix** (protocol v15) — in the
  lobby of a track in `RAIN_TRACKS` (São Paulo) the manager's 1/2 choose dry or rain for the whole
  GP (kept after play again); `GrandPrixInfo.weather`, the server's room and every prediction run
  the same wet track, the view switches live, the panel says RAIN. Practice and Time trial always
  dry; wet laps in the same records ([weather.md](weather.md#online-w3)).
- 2.7 W.4 **Spray** — pixel water spray behind the wheels in the rain, growing with speed.

## Phase 3 — Elevation (Monaco v2) ✅

Since 2.4b Monaco v2 is simply **Monaco** (the flat one removed); the names below are the time's.

**Scope: one map, Monaco v2**, built and tested in single player first (3a–3e), then offered
online in every mode too (3f, owner's request after the test). Every other circuit, Monaco
included, stays flat and untouched. Design: [elevation.md](elevation.md).

Goal: a track that climbs and falls like the real one. Monaco v2 is Monaco with its real height
differences: the climb from Sainte Dévote to Casino, the descent to Mirabeau and the Loews, the
harbour front at sea level. Owner's choices (2026-11-03): **real physics but mild** (gravity along
the slope × a tunable factor), **real heights** (first real gradients, heights × scale: too much
after the 3c test), **its own scale**
(the Hard bot laps in the real pole time, 1:09.954), **the town on the real terrain**.

Data: track heights from **OpenF1 `location.z`** (F1's own positioning; Monaco's pole lap: 41.9 m
of height difference, published 41.8 m), land from **EU-DEM 25 m** (OpenTopoData), the two
aligned along the track.

- 3a ✅ **Heights data** (tool only): `z` kept by `fetch`, smoothed heights per station in `profile`,
  the DEM grid (`terrain.ts` → `data/<id>.terrain.json`), the track aligned to it, an elevation
  preview; report vs the published figures. No game change. Monaco: 41.5 m of height difference
  (published 41.8), 50.1 m at Casino, 8.5 m at the Piscine, +9.2 % at Beau Rivage, −8.3 % at
  Mirabeau Bas ([elevation.md](elevation.md#measured-monaco-3a)).
- 3b ✅ **Model**: track heights and grades (`TrackPoint.height`, samples, `locateOnTrack`); the slope
  force (`SLOPE_PARAMS.factor`, F2); the bot's speed profile with the grade; Monaco v2 generated and
  calibrated on the pole. Flat tracks bit-identical. Headless tests only. Monaco v2: Hard bot
  70.03 s at Monaco's own scale (1.133); factor 0.5: −3 km/h at the top of the climb, braking 3 m
  earlier for Mirabeau ([elevation.md](elevation.md#model-3b-)).
- 3c ✅ **View**: track, kerbs, walls, lines, grid, gantries and lights at their heights; the car's
  height and pitch, cameras following; Monaco v2 in the single-player menu (`TRACKS` only) on plain
  ground. Owner tries the feel (F2 → Slope for the factor). Details:
  [elevation.md](elevation.md#view-3c-).
- 3d ✅ **Terrain and town**: the DEM terrain meeting the track, `groundHeight(x, z)`; Monaco's town
  and props on it, the sea at 0, the tunnel following the track. Before it (owner's 3c test): the
  heights in real metres (× scale was too much), the harbour front at 2.5 m above the sea, the
  ground after the Grand Hotel hairpin fixed. Details:
  [elevation.md](elevation.md#terrain-and-town-3d-).
- 3e ✅ **Owner test** (2026-11-03): approved; the slope factor stays 0.5.
- 3f ✅ **Monaco v2 online** (owner's request): in `GP_TRACKS`, so Free practice, Time trial and
  Grand Prix offer it; the server and the prediction run the same slope (`SLOPE_PARAMS`: no F2
  online); the nickname tags float over the car's height.

Not in Phase 3 (until the owner asks): elevation on other circuits (São Paulo: 2.4e), elevation online (done in 3f).

## Phase 4 — Pit lane and car damage (Grand Prix only)

**Scope: the online Grand Prix only**, on every circuit of `GP_TRACKS` (Monza, Barcelona, Monaco,
Mexico City, Monaco v2). Free practice, Time trial and single player stay exactly as they are:
no damage, the pit lane decorative behind its wall. Design: [damage.md](damage.md).

Goal: a car is damaged by hitting other cars and walls and by time spent on grass and gravel, and
gets slower according to how much and where it is damaged. A drivable pit lane, placed where the
real one is on each circuit, is the only way back to an undamaged car.

Owner's choices (2026-11-04):

- **Tyres: damage only** (impacts, grass, gravel), no wear lap after lap: pitting depends on
  incidents.
- **Never retires from damage**: there is a floor, the car always stays drivable and can reach
  the pits.
- **Pit stop automatic in the box**: an automatic limiter in the pit lane, the car stops by itself
  in its own box, a repair time that grows with the damage, then it leaves as new.
- **The pit lane is drivable only in the Grand Prix**; in every other mode it stays decorative.

Details (numbers, look, rules) are decided in each step with the owner.

**Damage**

- 4a ✅ **Damage model** (shared, pure, tested) — `CarState.damage` (optional: only with
  `SimContext.damage`): front wing, rear wing and the four tyres, each 0..1, up to a ceiling of 1.
  Impacts (cars and walls) above 4 m/s (8 since 4i) of closing speed damage the part hit, chosen
  by the contact point in the car's frame (front → front wing + front tyres, rear → rear wing + rear tyres,
  side → that side's tyres); grass and gravel wear each wheel's tyre per second, by speed. R keeps
  the damage. Numbers in `config/damage.ts` (`DAMAGE_PARAMS`, provisional), measured in
  [damage.md](damage.md). Not active anywhere yet.
- 4b ✅ **Effects on the car** — `damagedParams`: less top speed, turning and grip, by part (front
  wing → turning, rear wing → grip, tyres → some of each), adding up down to floors (80% / 60% /
  50%): never undrivable, never a retirement. `damagedInput`: uneven tyres pull to their side.
  Hard bot: +3% to +8% per part, +20% (Monza) to +28% (Monaco) with everything destroyed
  ([damage.md](damage.md#effects-4b)). Dev only: F2 → Damage turns it on in single player and sets
  the player's parts by hand; F3 shows them.
- 4c ✅ **Damage view** — HUD: a damage panel bottom right, the car from above with front wing,
  tyres and rear wing coloured white → yellow → orange → red; only when the car has damage. On the
  car: the front wing's halves bend down (most on the side hit) and break off, the rear wing tilts
  and breaks off, tyres go flat from half damage ([damage.md](damage.md#view-4c)). Tried in
  single player through the dev toggle.
- 4d ✅ **Damage online in the Grand Prix** (protocol v11) — damage in the snapshot's cars, only in
  Grand Prix rooms and only in qualifying and the race (`damageInPhase`): `GrandPrix.setPhase`
  turns the room's damage on or off (off repairs every car), the client's prediction follows the
  phase. Free practice and Time trial unchanged (tested) ([damage.md](damage.md#online-4d)).

**Pit lane**

- 4e ✅ **Pit lane data** — generated from OSM's `pit_lane` into every real circuit's shared layout
  (`pitLane`, `01_tools/openf1/pitLane.ts`): where it really leaves and rejoins the track, its
  centreline (the real line over the track, then right behind a 1 m pit wall with the real shape;
  squeezed where another stretch is too close: Monaco's by the Piscine), the limit lines (where the
  real lane is beside the track), 8 boxes along the real pit buildings (spread where OSM maps none:
  Monaco, Mexico City), the real limit × scale (80 km/h, Monaco 60). Positions in metres along the
  lane. Previews `preview/<id>-pitlane.png`; results in [pitlane.md](pitlane.md).
- 4f ✅ **Drivable pit lane** — `buildTrack(def, { pitLane: true })`: the pit lane as one more
  route (it crosses the start line: its route starts where the lane rejoins, progress wraps), its
  own walls at its edges (pit wall, garages), no kerbs; the track's wall opens where it leaves and
  rejoins. Built only by the Grand Prix (server rooms and client); every other mode unchanged. The
  bot never takes it. Drawn with the track (the decorative lane left out there). Dev only: F2 → Pit
  lane, or `?pitlane`, in single player. Tested on every circuit: open from track to track, a car
  drives through without touching a wall ([pitlane.md](pitlane.md#drivable-4f)). Owner's test: all
  fine but Monaco, made cleaner: its entry and exit join at the track's edge, smoothed (no folded
  walls), and on the track's asphalt the pit lane never wins (none of it on the track).
- 4g ✅ **Pit stop** (protocol v12) — automatic limiter between the limit lines; each GP driver
  keeps a box from joining to leaving (own box painted yellow); slower than 29 km/h at it, the car
  stops by itself, held for 2.5 s + 6 s × front wing + 8 s × rear wing damage, then leaves as new;
  one stop per pass. Pure rules in shared (`sim/pit.ts`, `config/pit.ts`), run by the server and
  the prediction alike. HUD: `PIT LIMITER`, `PIT STOP` countdown. Dev: in single player with F2 →
  Pit lane ([pitlane.md](pitlane.md#pit-stop-4g)).
- 4h ✅ **Pit lane in the Grand Prix's timing** (protocol v13) — the timing tower marks drivers in
  the pit lane (`PIT`, `BOX` while stopped), live from the predicted world; the server counts each
  driver's stops in the race, shown in a `STOPS` column of the classification; the lap is timed
  over the start line in the pit lane (tested on every circuit)
  ([pitlane.md](pitlane.md#in-the-grand-prix-4h)).
- 4i (in progress) **Owner test over Tailscale** on every circuit; damage and stop numbers tuned.
  - Cars sturdier (owner, 2026-11-04: damaged too easily): impacts from 8 m/s instead of 4 and
    0.018 per m/s instead of 0.025; grass and gravel wear halved / −40%
    ([damage.md](damage.md#impacts)).
  - P.1 (awaiting the owner's test) **Solid pit wall** (owner, 2026-11-18: scraping it threw the
    car into or out of the lane): a wall catches a car from behind only if it started the tick in
    front of it ([collisions.md](collisions.md#walls--wallsts)).
  - P.2 (awaiting the owner's test) **São Paulo's pit lane**: no grass through it
    (`groundUnderRoutes`), heights never steeper than 5% (`pitLaneMaxGrade`), the 8 boxes 20 m
    apart by the start line and a 240 m limiter round them instead of 1032 m (`pitBoxesAtLine`)
    ([pitlane.md](pitlane.md#results)).

## M — Menus and Grand Prix rules (owner, 2026-11-19)

Singleplayer: Free practice, Time trial (ghost + local records), Test (the bot, F3 open, F2 tuning
in dev). Multiplayer: Free practice and Grand Prix. Only the real F1 circuits everywhere. GP race
over 4 / 8 / 12 laps or 1–24 chosen; a mandatory pit stop every 4 laps (at most 4), 25 s per one
missing. One step at a time, each awaiting the owner's review.

- M.1 (awaiting the owner's review) **F1 circuits only** — Kruncar removed (layout, theme, props,
  Kruncar-only builders and textures); the Test Ring left only as the tests' fixture (no theme, the
  classic look removed). `GP_TRACKS` is the game's one list of circuits (`TRACKS` gone).
- M.2 (awaiting the owner's review) **Singleplayer menu** — mode menu (Free practice, Time trial,
  Test) before the track menu. Free practice: alone. Time trial: alone with the ghost (moved to
  `singleplayer/ghost.ts`) and this browser's best lap per circuit (`localRecords.ts`,
  `localStorage`; shown in the track menu). Test: as before (bot, B) with F3 open from the start;
  F2, F4, `?pitlane`, `?rain` in dev and in Test only.
- M.3 (awaiting the owner's review) **Multiplayer = Free practice + Grand Prix** (protocol v16) —
  online Time trial removed: no private rooms (`roomKey` is `mode/track`), no ghost online, lap
  records for the Grand Prix only (old time-trial rows left in the database, unread).
- M.4 (awaiting the owner's review) **Grand Prix laps: 4 / 8 / 12 or 1–24** (protocol v17) — on
  the grid the manager's 1/2/3 start at once as before; 4 opens any other distance (from 12, ←/→
  or −/+, Enter starts). The server accepts any whole number from 1 to 24 (`isRaceLaps`).
- M.5 (awaiting the owner's review) **Mandatory pit stops** — one per 4 laps, rounded down, at
  most 4 (`race/pitRule.ts`); 25 s per one missing, added to the race time of every classified
  driver (finishers at the flag; the rest in the results, on their laps), never to a DNF; the
  order follows. Tower: stops made / required; card: `STOPS` and `PENALTY` columns
  ([multiplayer.md](multiplayer.md#grand-prix)).

## S — Single-player Grand Prix against 9 bots (owner, 2026-11-19)

Free practice in single player becomes a Grand Prix against 9 bots (5 Hard, 4 Medium) in 5 teams
(Mercedes, Ferrari, Red Bull, McLaren, Polimi): the player takes a seat in the team they choose;
qualifying alone (the bots' times measured for their class), laps as online, damage, weather choice,
mandatory stops for everyone; podium, classification with F1 points and the constructors' standings
of that race. One step at a time, each awaiting the owner's review.

- S.1 (awaiting the owner's review) **Teams, drivers and liveries** — `TEAMS`, `teamLineup`
  (5 Hard / 4 Medium by team strength, the player replaces a random driver of their team),
  `TEAM_LIVERIES` with stripe colour and Polimi's "OF" sponsor ([bot.md](bot.md#single-player-grand-prix)).
- S.2 (awaiting the owner's review) **Bots that race in traffic** — they follow without running
  into the car ahead, pass a slower one from its tow on the side with more room, give up a pass
  before a braking zone and keep to their side of a car alongside; alone they drive as before
  ([bot.md](bot.md#in-traffic)). The Test mode's bot sees the player too.
- S.3 (awaiting the owner's review) **Bots that pit** — a pit plan through the lane to their own
  box (limiter, slow at the box: the stop starts by itself), the mandatory stops spread evenly over
  the race, switching plans only outside the pit lane's stretch; cars in their box passed and
  crept round ([bot.md](bot.md#pit-stops)).
- S.4 (awaiting the owner's review) **One GP engine for both modes** — `GrandPrix` moved to
  `shared/src/race/` on a `GrandPrixRoom` interface (the server's `Room` implements it; online
  unchanged), with drivers whose qualifying time is given (`addSimulated`: only the player drives
  qualifying); the GP panel and results texts moved to `client/src/race/`, taking a `DriverLook`
  instead of the online player.
- S.5 (awaiting the owner's review) **Single-player Grand Prix** — Free practice replaced: team →
  circuit → weather, qualifying alone (bots' times measured for their class), grid and keys as
  online, race against the 9 bots with stops and damage, podium and classification, Race again
  ([bot.md](bot.md#single-player-grand-prix)). Team boxes (a busy box is skipped).
- S.6 (awaiting the owner's review) **Points and constructors' standings** — F1 points to the
  first ten (`racePoints`), the constructors' standings of the race (`constructorStandings`); the
  classification card gets TEAM and PTS, then a constructors' card ([bot.md](bot.md#single-player-grand-prix)).

## X — Native macOS app in Swift (owner, 2026-11-22)

The game as a macOS app written entirely in Swift (`04_macos/`, [macos.md](macos.md)): RealityKit
with a realistic PBR look, SwiftUI menus and HUD in Liquid Glass, every feature of the web game,
online on the same Node server. One step at a time, each awaiting the owner's review.

- X.0 (awaiting the owner's review) **Scaffolding** — Xcode project (`AltF1.xcodeproj`, folder
  synced) + the `AltF1Core` Swift package, `01_tools/swiftExport` (the 7 circuits' definitions,
  scenery and land as JSON), the start menus in Liquid Glass (mode → single-player mode → circuit).
- X.1 (awaiting the owner's review) **Port of the model** — math, config, track (`buildTrack`,
  query), sim (car, surfaces, slipstream, laps, collisions, damage, pit, weather) in
  `AltF1Core`; parity tests on fixtures recorded with the TypeScript (`01_tools/swiftExport/fixtures.ts`):
  tracks bit-identical on all 7 circuits, `stepGame` within 1 ulp per tick on Monza, Monaco (pit
  stop, damage, heights) and São Paulo (rain) ([macos.md](macos.md#parity)).
- X.2 (awaiting the owner's review) **First drivable lap** — Test on any circuit: fixed 60 Hz loop
  with interpolation, the track's meshes (asphalt, lines, kerbs, gravel, guard rails and tyre
  walls, start line, grid) in PBR from procedural textures, the car rebuilt in PBR, sky (skybox +
  environment light), sun with shadows, tone mapping; chase and first-person cameras (V, Z, speed
  FOV), WASD/Space/R/Esc, speed in a Liquid Glass HUD; dev options for snapshots
  ([macos.md](macos.md#rendering-x2)). Then the owner's onboard (from a TV onboard photo): the
  camera behind the helmet looking through the halo, front tyres, mirrors and steering wheel in view.
- X.3 (awaiting the owner's review) **HUD and Time trial** — the timing strip (sectors in F1
  colours, gap chip), minimap, F3 telemetry, in Liquid Glass; Time trial with the ghost and this
  Mac's records in the track menu ([macos.md](macos.md#hud-and-time-trial-x3)). Test's bot comes
  with X.4.
- X.4 (awaiting the owner's review) **Bots and the single-player Grand Prix** — first the car
  rebuilt after the owner's side and rear photos (lofted body, open cockpit with the driver, one body
  for every car, the livery its only difference); then `ai/` and `race/` ported with parity tests
  (plans, driving in traffic, qualifying laps) and a headless GP test; Test's bot (B); the GP with
  team, circuit and weather menus, qualifying, grid and distance, F1 lights, race through the drawn
  pit lane, panel, sector table, damage, results with points and constructors
  ([macos.md](macos.md#bots-and-the-grand-prix-x4)). Name tags and the flag marshal come later.
- T.1 (awaiting the owner's test) **Tyres: soft and medium** — web and Mac, online (protocol v18):
  the choice at a stop (1 / 2), wear, bots by their stint ([tyres.md](tyres.md)).
- C.1 (awaiting the owner's review) **A more realistic car, damage on it** — lofted wings and
  tyres, diffuser, brake ducts, floor edges; the web's damage look (drooping or missing front wing
  halves, tilted or missing rear wing, flat tyres) and debris: broken parts and carbon shards flying
  off, bouncing and sliding on the road ([macos.md](macos.md#the-car-x3-the-owners-photos)).
- X.5 Scenery, one circuit per sub-step ([macos.md](macos.md#scenery-x5)):
  - X.5a (awaiting the owner's review) **Monaco** — the town on the real land, Casino, chapel, Port
    Hercule and its yachts, the pool, the tunnel, hills, catch fences.
  - X.5b (awaiting the owner's review) **Singapore** — the night race: night sky, floodlights, the
    town lit window by window, the Flyer, Marina Bay Sands' SkyPark, the durians, the bay.
  - Next: Monza, Barcelona, Mexico City, Las Vegas, São Paulo.
- X.6 Rain: puddles, wet look and physics, wet tyres, falling rain (N), spray.
- X.7 Online, on the web's server (Mac and browser in the same rooms) ([macos.md](macos.md#online-x7)):
  - X.7a (awaiting the owner's review) **Protocol and socket** — the protocol's messages and the
    nickname rules in `AltF1Core/Net` (parity with the web's own messages), the address the player
    types → the socket's URL, `NetClient` on `URLSessionWebSocketTask`; tried on a local server.
  - X.7b (awaiting the owner's review) **Lobby menus** — Multiplayer enabled: server address and
    nickname (remembered), mode with players online, circuit with the Grand Prix's TOP 10, the room
    with its players live; disconnected and refused cards.
  - X.7c (awaiting the owner's test) **Online Free practice** — the web's prediction in Swift
    (`Predictor`, tested), the race on screen with everyone's liveries and names.
  - X.7d (awaiting the owner's test) **Online Grand Prix** — the panel by phase (manager or not),
    lights, damage, tyres, results with Play again; how friends set it up in the README.
    Fix (2026-11-24): the own yellow pit box follows the server's boxes live (it was painted once
    and could show a box where the car never stopped).
  - Next: the lap-record boards in the results, name tags over the cars, a zip of the app.
- X.8 Polish: gamepad, settings (quality, server), Debug tuning panel, app icon, performance.

## Later

- Desktop packaging (Tauri/Electron), assets, audio.
