# Multiplayer (Phase 2)

Phase 2 (sub-steps in [roadmap.md](roadmap.md)): a start screen with **Singleplayer /
Multiplayer**, a nickname lobby, then a choice of mode (2.3) and circuit (Monza, Barcelona,
Monaco): everyone who picks the same mode and circuit drives together on it, the own car predicted
by the client (2.2). Each
section says which sub-step built it.

## Flow

```
Start screen ── Singleplayer ──▶ Track menu (all tracks, bot) ──▶ single-player game
             └─ Multiplayer ───▶ Nickname ──▶ connect ──▶ Mode menu ──▶ Track menu (Monza /
                                  Barcelona / Monaco) ──▶ that room's circuit, with everyone in it
```

- **Singleplayer** is today's game, unchanged.
- **Multiplayer**: the player types a nickname; if the server accepts it they pick a mode (see
  [Modes](#modes-23)) and one of the three F1 circuits (each with how many players are on it) and
  are put in that room, where everyone else who picked it is already driving. Otherwise the reason
  shows under the nickname field.
- **Esc** in either mode reloads the page: back to the start screen (in multiplayer this closes the
  connection, which frees the nickname).

## Separation of the two modes (2.1a ✅)

The owner's rule: the two sections never mix. Enforced, not just by convention:

- **Folders**: `client/src/singleplayer/` (`SinglePlayerGame`, `start.ts`: track menu → race)
  and `client/src/multiplayer/` (`start.ts`, `NetClient`, `serverUrl`, `lobbyText`, `OnlineGame`,
  `Predictor`). The building blocks both use stay where they are: `GameLoop`, `SceneView`, `Hud`, `KeyboardController`, the menus' look.
- **Loading**: `main.ts` imports a mode with a dynamic `import()` only once it is chosen. Choosing
  Singleplayer never loads or opens any network code; choosing Multiplayer never builds a bot.
- **Lint**: an ESLint `no-restricted-imports` rule (`eslint.config.js`) forbids `singleplayer/**` ↔
  `multiplayer/**` imports, and imports of either from `core`, `controller`, `dev` and `view`.
- No shared mutable state between the modes; switching mode always goes through a page reload.

## Nicknames (2.1b ✅, 2.1c ✅, 2.1d ✅)

- Rules in `shared/src/net/nickname.ts` (`checkNickname`, tested): Unicode-normalized, trimmed,
  inner spaces collapsed to one, then **3–16 characters** (an accented letter counts once): letters
  of any language, digits 0–9, space, `_`, `-`. Problems: `tooShort`, `tooLong`, `badChars`.
- **Unique among the players online**, case-insensitive (`Enea` and `enea` clash). A nickname is
  reserved while its player is connected and freed as soon as they disconnect. No accounts or
  passwords in 2.1.
- One pure function in `shared/src/net/nickname.ts`: the client uses it for instant feedback, the
  server applies it again and is the only authority on uniqueness.
- The last nickname used is prefilled from the browser's `localStorage` (convenience only).

## Protocol (2.1b ✅)

JSON over one WebSocket, typed unions in `shared/src/net/protocol.ts`, with a `PROTOCOL_VERSION`
(a client with another version is rejected with `version`). Version **5** since 2.3b (rooms and
`enter` carry the mode; v4 = 2.2c snapshots carry each car's last input; v3 = 2.2a input `seq`,
acks, ping; v2 = 2.1f+ rooms).

| Direction       | Message    | Content                                                                |
| --------------- | ---------- | ---------------------------------------------------------------------- |
| client → server | `hello`    | `protocol`, `nickname`                                                 |
| client → server | `enter`    | `mode`, `track`: go into that room (once, after the welcome)           |
| client → server | `input`    | `seq` + `InputCommand`, once per client tick (only once in a room)     |
| client → server | `ping`     | `t` (the client's clock), once a second in a room                      |
| server → client | `welcome`  | own `playerId`, the `rooms` offered (`mode`, `track`, `players` in it) |
| server → client | `rejected` | `reason`: `taken` / `invalid` / `full` / `version`                     |
| server → client | `entered`  | the room's `track` and the players in it                               |
| server → client | `players`  | the players in the room, sent on every join and leave there            |
| server → client | `snapshot` | whole `GameState`; per car `acks` (last `seq` run) + `inputs`; 30 Hz   |
| server → client | `pong`     | the `ping`'s `t`, echoed: the client measures the round trip           |

- **The server trusts nothing**: `parseClientMessage` returns `null` for bad JSON, unknown types,
  missing or wrong-typed fields, non-finite numbers, and nicknames or track names longer than 64
  characters; it
  clamps inputs (`throttle`/`brake`/`reverse` 0..1, `steer` −1..1) and keeps only the known fields.
  `parseServerMessage` (client side) only checks the JSON and the type: the server is trusted.
- `PlayerInfo` = `id`, `nickname`, `livery` (an index; the client picks the colours, `shared` has no
  view data). `RoomInfo` = `mode` (one of `ONLINE_MODES`), `track`, `players` (a count). An `enter`
  with an unknown mode is malformed (`null`). `MAX_PLAYERS` = 8 (online in total, all
  rooms) is shared too, so the client can explain `full`.

## Server (2.1c ✅, 2.1e ✅)

`01_packages/server` (Node 26 + `ws` 8). It runs its TypeScript directly (Node's type stripping) with
the extensionless-import loader `01_tools/resolveTs.ts`, shared with the OpenF1 tool: no build step.
Shared code comes in as `@altf1/shared` through the workspace link. Start with `npm run server`
(`node --watch`: restarts on save) on port **8787**, path `/ws` (`PORT` overrides the port). If the
port is taken (a server already running) it says so and exits.

| File            | Role                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| `Lobby.ts`      | Who is online: nickname registry, player ids, liveries. Pure, tested                       |
| `Room.ts`       | One circuit's race: authoritative simulation with each player's latest input. Pure, tested |
| `GameServer.ts` | Lobby + rooms + messages, with no sockets and no timers (tested with fake connections)     |
| `main.ts`       | Adapts `ws` sockets and real time to `GameServer`; hello timeout, heartbeat, logs          |

- **Joining** (`hello`, only before joining; later ones are ignored). `Lobby.join` checks, in this
  order: protocol version → `version`; `checkNickname` → `invalid`; 8 players online → `full`;
  `nicknameKey` already online → `taken`. A rejected client gets `rejected` and its socket is closed
  (code 1008). An accepted one gets `welcome` (its id and the rooms on offer, with how many players
  are in each). Nicknames are unique over the whole server, whichever room.
- **Ids** `p1`, `p2`, … are never reused, so a late message from someone who left can't reach a
  newcomer. **Livery** = lowest index nobody online uses (0 = first colour).
- **Entering a room** (`enter`, once, after the welcome): see Rooms below. A track not
  on offer, a second `enter` and inputs before entering are ignored, like garbage
  (`parseClientMessage` → `null`).
- **Leaving** (socket closed, or dropped by the heartbeat): nickname and livery are freed at once,
  the car is removed, the others in its room get `players`; an emptied room is closed.
- **Hello timeout**: a socket that hasn't joined within 10 s is closed. **Heartbeat**: every socket
  is pinged every 5 s; one that didn't answer the previous ping is terminated, so a laptop that
  drops off the network frees its nickname within ~10 s.
- **Time**: `setInterval` at 60 Hz measures real elapsed time and feeds `GameServer.advance`, a
  fixed-step accumulator like the client's `GameLoop` (at most 0.25 s simulated at once).
- **Logs**: one line per join, rejection and leave, and per room opened, entered and closed, e.g.
  `[lobby] Enea joined as p1 (2 online)`, `[rooms] practice/Monza is live`,
  `[rooms] Enea entered practice/Monza (1 there)`, `[rooms] practice/Monza closed (empty)`.

## Rooms (2.1e ✅, 2.1f+ ✅)

- **One room per ready mode and circuit**: `READY_MODES` × `ROOM_TRACKS` (`GameServer.ts`), circuits
  **Monza, Barcelona, Monaco** (2.1f+, owner's choice; 2.1e had a single Test Ring room). Rooms are
  keyed `mode/track` (`roomKey`, e.g. `practice/Monza`); an `enter` for a mode not in
  `READY_MODES` is ignored.
- **Private rooms** (2.3c): in a mode of `PRIVATE_MODES` (time trial) every player gets a room of
  their own, keyed `mode/track/player` (`timeTrial/Monza/p3`): same `Room`, same snapshots, nobody
  else in it. The `welcome` counts, per circuit, everyone driving that mode there. A room is created the moment its first player
  enters (`[rooms] Monza is live`) and closed when its last one leaves, so the next player starts a
  fresh session. Rooms are fully apart: each has its own simulation, players list and snapshots.
- Up to 8 players online in total for now (`MAX_PLAYERS`), no bots. Default tuning
  (`CAR_PARAMS`, `SURFACE_PARAMS`, `COLLISION_PARAMS`, `SLIPSTREAM_PARAMS`): collisions, slipstream
  and lap timing work exactly as in single player, it is the same `stepGame`.
- **Spawn**: `spawnOnGrid` (`shared/src/sim/game.ts`, pure, tested) puts the new car at rest on the
  first grid slot with no car within 6 m, on an out-lap. A slot frees up as soon as its car drives
  away.
- **Inputs** (2.2a): each player has a **queue**; every tick runs exactly one input from it, the
  one the client simulated for that tick, and records its `seq` as the car's ack (`Room.acks`,
  sent in every snapshot). A duplicate or older `seq` is ignored. An empty queue repeats the last
  input (without its `reset`, so R is applied exactly once). Past `MAX_QUEUED_INPUTS` (6 ticks,
  100 ms) the oldest inputs are dropped (a dropped reset moves to the next input), so a burst after
  a network hiccup never leaves the car running late. No input yet = neutral.
- **Rates**: every live room is simulated at 60 Hz and sends a `snapshot` (its whole `GameState`)
  to its players every 2 ticks = **30 Hz** (`SNAPSHOT_EVERY_TICKS`). Players who joined but haven't
  picked a circuit yet get none.

## Joining (2.1d ✅, 2.1f+ ✅)

```
Start ─ Multiplayer ─▶ NICKNAME ──Enter──▶ connect /ws ──hello──▶ welcome ─▶ MODE ─▶ TRACK ──enter──▶ entered ─▶ race
                          ▲                    │                    │
                          └── error under the field: unreachable / rejected ◀─┘
```

- **One origin**: the page connects to `ws(s)://<page host>/ws` (`multiplayer/serverUrl.ts`);
  Vite's dev server (and `vite preview`) proxies `/ws` to `localhost:8787`, so localhost, LAN and
  Tailscale all work with the URL the page came from.
- **Nickname screen** (`view/menu/NicknameScreen.ts`, knows nothing about the network): a text field
  prefilled with the last nickname used on this browser, a live hint (`checkNickname`), Enter to
  join ("Connecting…" while waiting), Esc back to the start screen. Errors stay under the field and
  the text stays in it, so one character can be fixed and Enter pressed again.
- **Messages** (`multiplayer/lobbyText.ts`): `taken` "Nickname already in use — pick another one",
  `invalid`, `full` "Server full (8 players)", `version` "This game is out of date — reload the
  page" (also when the server's track is unknown to this game), `unreachable` "Server unreachable —
  is it running? (npm run server)", `disconnected`.
- **Mode menu** (2.3b, a `ListMenu`): `MULTIPLAYER · MODE` lists every online mode
  (`modeItems` in `multiplayer/lobbyText.ts`): the ones with rooms in the `welcome` with how many
  are playing, the others dimmed as "Work in progress" (disabled `ListMenu` rows are skipped by
  W/S and can't be chosen).
- **Track menu** (2.1f+, a `ListMenu`): `<MODE> · TRACK` with that mode's rooms from the `welcome`
  (only tracks this game knows), each with "empty" or "N online" as it was at the welcome; Enter
  sends `enter`, the `entered` answer starts the race; Esc goes back to the start screen.
- `multiplayer/NetClient.ts`: the socket wrapper (typed messages, 5 s connect timeout);
  `multiplayer/start.ts` wires the nickname screen, the track menu and the race. From the track menu
  on, a lost connection shows the DISCONNECTED menu.
- Owner's choice (2.1f): no lobby list — once in a room, the player is on the track.

## Online race (2.1f ✅)

`multiplayer/OnlineGame.ts`, the online counterpart of `SinglePlayerGame`, built from the same
blocks (`GameLoop`, `KeyboardController`, `SceneView`, `Hud`, `DebugOverlay`). It runs **no
simulation**: the server is the only one.

- **Inputs**: every tick (60 Hz) the keyboard's `InputCommand` goes to the server as `input` with
  the next `seq` (0, 1, 2, …). R is sent as `reset` for one tick; the server runs it exactly once.
  A `ping` goes out once a second; F3 shows the last round trip (`rtt`).
- **Snapshots → picture** (2.2b–c): the client draws the room as **predicted** by
  `multiplayer/Predictor.ts` (see [Prediction](#prediction-22)), ticked by the same `GameLoop` as
  single player and drawn with its `alpha` (`SceneView.render(prev, curr, alpha)`). The own car
  responds on the frame the key is pressed. Until the first snapshot with the own car nothing is
  drawn. (2.1f played the snapshots back ~67 ms behind with a `SnapshotBuffer`: the own car reacted
  a round trip + 67 ms late, which the 2.1g test found too slow; removed in 2.2b.)
- **Liveries**: `PLAYER_LIVERIES` (`view/pixelTexture.ts`): red, blue, green, yellow, orange,
  purple, cyan, pink, by the server's livery index (`playerLivery`). `SceneView.setLivery` — the
  `players` message always arrives before the first snapshot with a new car (same socket), so a car
  is created in its colour.
- **Nickname tags** (`view/NameTag.ts`): over every other car, a sprite with the nickname (white on
  a dark pill, crisp pixels), depth-tested so walls hide it; it shrinks with distance up to 35 m,
  then keeps its size on screen so it stays readable. Never over the own car.
- **HUD**: laps, sectors, speed and SLIP from the predicted state (so the timing reacts at once,
  corrected by the server like the car); the bot item is hidden (`Hud.hideBot`). F3 shows the own
  car's telemetry, the last input sent, `rtt`, `ahead` (ticks predicted past the newest snapshot)
  and `corrected` (how far the last snapshot moved the own car, m).
- **Keys**: WASD/Space drive, R reset, V camera, Z look back, F3 overlay, Esc back to the start
  screen (the reload closes the socket, which frees the nickname and removes the car). B, F2 and F4
  are single-player only.
- **Disconnect** (server stopped, network lost): a DISCONNECTED menu over the race; Enter or Esc
  goes back to the start screen.
- The server keeps a cap of 8 players online for now (`MAX_PLAYERS`, over all rooms).

## Two machines (2.1g ✅)

Owner test with friends, each on their own machine over Tailscale: joining, choosing a circuit and
driving together all work. The problem: the own car's **lag and delay are too high** — it only
moves when the server's snapshot comes back (a round trip + the 67 ms playback delay), which
makes it feel heavy and late. Fixed by 2.2.

## Prediction (2.2)

Sub-steps in [roadmap.md](roadmap.md#22--client-side-prediction-the-own-car-responds-instantly).

- **Inputs are numbered** (2.2a ✅): every client tick sends `input` with a growing `seq`. The
  server keeps a **queue per player** and runs exactly one input per tick (the one the client
  simulated for that tick) (see Rooms above). Each `snapshot` carries `acks` (the last
  `seq` each car ran) and, since 2.2c, `inputs` (that input). `ping`/`pong` measures the round trip.
- **Same simulation everywhere**: `onlineSimContext` (`shared/src/net/simContext.ts`) gives the
  parameters both the server's `Room` and the client's `Predictor` run (default `CAR_PARAMS`,
  `SURFACE_PARAMS`, `COLLISION_PARAMS`, `SLIPSTREAM_PARAMS`), so a prediction with the right
  inputs matches the server exactly (tested). The F2 tuning panel stays single-player only.
- **The whole room is predicted** (`client/src/multiplayer/Predictor.ts`, pure, tested):
  - every client tick, `stepGame` moves the predicted world one tick: the **own car with its own
    input** (2.2b: walls, surfaces, reset, lap timing respond at once), the **other cars with the
    last input the server saw from them** (2.2c, without its reset), so contacts and slipstream
    with them are predicted too and they are drawn where the own car meets them;
  - on every snapshot it restarts from the server's state, drops the own inputs the server already
    ran (`seq` ≤ its ack) and replays the others (about half a round trip + the server's queue;
    F3 `ahead`). Kept for replay: at most 120 inputs (2 s). Cost: ~0.12 ms per tick with 8 cars,
    so a snapshot's replay is a few ms at most;
  - **corrections**: every car stays where it was drawn and glides to its corrected place (the
    offset fades at 10/s, ~90% gone in 0.25 s); one bigger than **4 m** (`SNAP_DISTANCE`: a crash
    the client didn't see, a reset) is shown at once.
- **Where corrections come from**: the other players changing their input (their car was predicted
  with the old one: the bigger the round trip, the bigger the glide), contacts that depend on that,
  and the client's and server's tick clocks drifting apart (the server's queue repeats or drops an
  input). With one player alone the correction is 0.
- (2.2c's first plan — keep the other cars on the ~67 ms playback with an adaptive delay — was
  dropped: they would be drawn behind where the own car can touch them.)

## Modes (2.3)

Chosen after the nickname, before the circuit; plan and sub-steps in
[roadmap.md](roadmap.md#23--online-game-modes-free-practice--time-trial--grand-prix), design
choices in [decisions.md](decisions.md#2026-10-28--online-game-modes-step-23-plan).

| Mode (`OnlineMode`)      | What it is                                                       | Status                    |
| ------------------------ | ---------------------------------------------------------------- | ------------------------- |
| Free practice `practice` | Everyone in the room laps freely (the 2.1–2.2 room)              | ✅ 2.3b                   |
| Time trial `timeTrial`   | Alone on the circuit, racing the ghost of the session's best lap | ✅ 2.3c, ghost ✅ 2.3d    |
| Grand Prix `grandPrix`   | Manager, qualifying Q1/Q2/Q3, grid, F1 lights, race, podium      | Work in progress (2.3e–i) |

### Time trial ghost (2.3d ✅)

Client only (the server just runs the private room): `multiplayer/ghost.ts` (`Ghost`, pure,
tested also against a real lap driven by the bot).

- **Recording**: every client tick, after the prediction moved, the own `CarState` is stored at its
  tick within the current lap (`tick - lapStartTick`). A tick the prediction redid after a snapshot
  overwrites what followed; a tick it skipped repeats the previous one. Nothing on the out-lap.
- **The ghost** = the recording of the fastest **valid** lap of the session: kept when a lap ends
  valid and faster than the ghost (or there is none yet). Slower or voided laps (R) never replace
  it. So the first timed lap has no ghost; from the second one on the player races it.
- **Replay**: the ghost runs on the current lap's clock (the same in-between tick the cars are
  drawn at), interpolated between two recorded ticks. Before the line it isn't shown; once its lap
  time has run out it disappears until the next lap starts.
- **Drawn** by `SceneView.setGhost` as a see-through `CarView` (opacity 0.35, no depth write) in the
  player's livery: no tag, not on the minimap, no collisions (it isn't in the simulation). The
  sector chip in the HUD already shows the gap to the best lap, i.e. to the ghost.

The server decides what is ready (`READY_MODES`): the `welcome` only lists rooms of ready modes,
and the client shows every other mode as "Work in progress", so turning a mode on is a server
change only.

## Dev setup

Two terminals at the repo root:

```
npm run server   # multiplayer server, port 8787 (restarts on save)
npm run dev      # the game (Vite), port 5173, also on LAN/Tailscale
```

Other machines open the dev URL (LAN or Tailscale IP, port 5173): their socket goes through the same
Vite server, nothing else to configure. Two browser tabs on one machine are two players.
