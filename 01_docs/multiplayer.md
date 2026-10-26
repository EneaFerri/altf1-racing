# Multiplayer (Phase 2)

Phase 2.1 (sub-steps in [roadmap.md](roadmap.md)): a start screen with **Singleplayer /
Multiplayer**, a nickname lobby, then a choice of circuit (Monza, Barcelona, Monaco): everyone who
picks the same circuit drives together on it. Each section says which sub-step builds it; this file
is updated as they land.

## Flow

```
Start screen ── Singleplayer ──▶ Track menu (all tracks, bot) ──▶ single-player game
             └─ Multiplayer ───▶ Nickname ──▶ connect ──▶ Track menu (Monza / Barcelona / Monaco)
                                                          ──▶ that circuit, with everyone on it
```

- **Singleplayer** is today's game, unchanged.
- **Multiplayer**: the player types a nickname; if the server accepts it they pick one of the three
  F1 circuits (each with how many players are on it) and are put on it, where everyone else who
  picked it is already driving. Otherwise the reason shows under the nickname field.
- **Esc** in either mode reloads the page: back to the start screen (in multiplayer this closes the
  connection, which frees the nickname).

## Separation of the two modes (2.1a ✅)

The owner's rule: the two sections never mix. Enforced, not just by convention:

- **Folders**: `client/src/singleplayer/` (`SinglePlayerGame`, `start.ts`: track menu → race)
  and `client/src/multiplayer/` (`start.ts`, `NetClient`, `serverUrl`, `lobbyText`, `OnlineGame`,
  `SnapshotBuffer`). The building blocks both use stay where they are: `GameLoop`, `SceneView`, `Hud`, `KeyboardController`, the menus' look.
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
(a client with another version is rejected with `version`). Version **2** since 2.1f+ (rooms).

| Direction       | Message    | Content                                                                 |
| --------------- | ---------- | ----------------------------------------------------------------------- |
| client → server | `hello`    | `protocol`, `nickname`                                                  |
| client → server | `enter`    | `track`: go into that circuit's room (once, after the welcome)          |
| client → server | `input`    | `InputCommand`, once per client tick (only once in a room)              |
| server → client | `welcome`  | own `playerId`, the `rooms` offered (`track`, how many `players` in it) |
| server → client | `rejected` | `reason`: `taken` / `invalid` / `full` / `version`                      |
| server → client | `entered`  | the room's `track` and the players in it                                |
| server → client | `players`  | the players in the room, sent on every join and leave there             |
| server → client | `snapshot` | the room's whole `GameState` (cars, laps, impacts), 30 times a second   |

- **The server trusts nothing**: `parseClientMessage` returns `null` for bad JSON, unknown types,
  missing or wrong-typed fields, non-finite numbers, and nicknames or track names longer than 64
  characters; it
  clamps inputs (`throttle`/`brake`/`reverse` 0..1, `steer` −1..1) and keeps only the known fields.
  `parseServerMessage` (client side) only checks the JSON and the type: the server is trusted.
- `PlayerInfo` = `id`, `nickname`, `livery` (an index; the client picks the colours, `shared` has no
  view data). `RoomInfo` = `track`, `players` (a count). `MAX_PLAYERS` = 8 (online in total, all
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
  `[lobby] Enea joined as p1 (2 online)`, `[rooms] Monza is live`, `[rooms] Enea entered Monza (1
there)`, `[rooms] Monza closed (empty)`.

## Rooms (2.1e ✅, 2.1f+ ✅)

- **One room per circuit** in `ROOM_TRACKS` (`GameServer.ts`): **Monza, Barcelona, Monaco** (2.1f+,
  owner's choice; 2.1e had a single Test Ring room). A room is created the moment its first player
  enters (`[rooms] Monza is live`) and closed when its last one leaves, so the next player starts a
  fresh session. Rooms are fully apart: each has its own simulation, players list and snapshots.
- Up to 8 players online in total for now (`MAX_PLAYERS`), no bots. Default tuning
  (`CAR_PARAMS`, `SURFACE_PARAMS`, `COLLISION_PARAMS`, `SLIPSTREAM_PARAMS`): collisions, slipstream
  and lap timing work exactly as in single player, it is the same `stepGame`.
- **Spawn**: `spawnOnGrid` (`shared/src/sim/game.ts`, pure, tested) puts the new car at rest on the
  first grid slot with no car within 6 m, on an out-lap. A slot frees up as soon as its car drives
  away.
- **Inputs**: each player's latest `InputCommand` drives its car every tick (none yet = neutral).
  `reset` (R) is **latched** until the next tick: a one-tick press is never lost when two inputs
  arrive between two ticks, and never applied twice.
- **Rates**: every live room is simulated at 60 Hz and sends a `snapshot` (its whole `GameState`)
  to its players every 2 ticks = **30 Hz** (`SNAPSHOT_EVERY_TICKS`). Players who joined but haven't
  picked a circuit yet get none.

## Joining (2.1d ✅, 2.1f+ ✅)

```
Start ─ Multiplayer ─▶ NICKNAME ──Enter──▶ connect /ws ──hello──▶ welcome ─▶ TRACK ──enter──▶ entered ─▶ race
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
- **Track menu** (2.1f+, a `ListMenu`): `MULTIPLAYER · TRACK` with the rooms from the `welcome`
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

- **Inputs**: every tick (60 Hz) the keyboard's `InputCommand` goes to the server as `input`. R is
  sent as `reset` for one tick; the server latches it, so it is applied exactly once.
- **Snapshots → picture** (`multiplayer/SnapshotBuffer.ts`, pure, tested): the last ~30 snapshots
  are kept; a render clock (in server ticks) runs at real time **4 ticks (~67 ms) behind the newest
  snapshot** — two snapshot gaps, so one late packet never stalls the cars — and the view
  interpolates between the two snapshots around it (the same `SceneView.render(prev, curr, alpha)`
  as single player). Small clock drift is eased out; a big jump (first snapshot, hidden tab)
  snaps. No extrapolation: if snapshots stop, the cars hold their last position.
- **Latency until 2.2**: the own car reacts about one round trip + 67 ms after a key press
  (~90–130 ms over LAN/Tailscale). Client-side prediction (2.2) removes it for the own car.
- **Liveries**: `PLAYER_LIVERIES` (`view/pixelTexture.ts`): red, blue, green, yellow, orange,
  purple, cyan, pink, by the server's livery index (`playerLivery`). `SceneView.setLivery` — the
  `players` message always arrives before the first snapshot with a new car (same socket), so a car
  is created in its colour.
- **Nickname tags** (`view/NameTag.ts`): over every other car, a sprite with the nickname (white on
  a dark pill, crisp pixels), depth-tested so walls hide it; it shrinks with distance up to 35 m,
  then keeps its size on screen so it stays readable. Never over the own car.
- **HUD**: laps, sectors, speed and SLIP from the snapshots as in single player; the bot item is
  hidden (`Hud.hideBot`). F3 shows the own car's telemetry and the last input sent.
- **Keys**: WASD/Space drive, R reset, V camera, Z look back, F3 overlay, Esc back to the start
  screen (the reload closes the socket, which frees the nickname and removes the car). B, F2 and F4
  are single-player only.
- **Disconnect** (server stopped, network lost): a DISCONNECTED menu over the race; Enter or Esc
  goes back to the start screen.
- The server keeps a cap of 8 players online for now (`MAX_PLAYERS`, over all rooms).

## Dev setup

Two terminals at the repo root:

```
npm run server   # multiplayer server, port 8787 (restarts on save)
npm run dev      # the game (Vite), port 5173, also on LAN/Tailscale
```

Other machines open the dev URL (LAN or Tailscale IP, port 5173): their socket goes through the same
Vite server, nothing else to configure. Two browser tabs on one machine are two players.
