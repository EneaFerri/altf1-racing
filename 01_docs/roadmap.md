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
  (manager's choice) → podium and classification → the manager closes the GP (the circuit's room
  is reset). Anyone arriving while a GP runs is told "GP in progress".

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
- 2.3h **GP: race** — position and lap in the HUD, gaps tower, finish → spectate, DNF; the manager
  can end it.
- 2.3i **GP: podium, classification, close** — results screen; the manager closes the GP, everyone
  goes back to the start.
- 2.3j **Owner test over Tailscale** of all three modes.

## Later

- Desktop packaging (Tauri/Electron), further tracks beyond the step 9 set, assets, audio.
