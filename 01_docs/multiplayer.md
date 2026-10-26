# Multiplayer (Phase 2)

Phase 2.1 (sub-steps in [roadmap.md](roadmap.md)): a start screen with **Singleplayer /
Multiplayer**, a nickname lobby, and every online player on the same Test Ring. Each section says
which sub-step builds it; this file is updated as they land.

## Flow

```
Start screen ── Singleplayer ──▶ Track menu (all tracks, bot) ──▶ single-player game
             └─ Multiplayer ───▶ Nickname ──▶ connect ──▶ Test Ring with everyone online
```

- **Singleplayer** is today's game, unchanged.
- **Multiplayer**: the player types a nickname; if the server accepts it they enter the Test Ring,
  where everyone else who joined is already driving. Otherwise the reason shows under the field.
- **Esc** in either mode reloads the page: back to the start screen (in multiplayer this closes the
  connection, which frees the nickname).

## Separation of the two modes (2.1a ✅)

The owner's rule: the two sections never mix. Enforced, not just by convention:

- **Folders**: `client/src/singleplayer/` (`SinglePlayerGame`, `start.ts`: track menu → race)
  and `client/src/multiplayer/` (`start.ts`, `NetClient`, `serverUrl`, `lobbyText`; the online race
  to come). The building blocks both use stay where they are: `GameLoop`, `SceneView`, `Hud`, `KeyboardController`, the menus' look.
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
(a client with another version is rejected with `version`).

| Direction       | Message    | Content                                                        |
| --------------- | ---------- | -------------------------------------------------------------- |
| client → server | `hello`    | `protocol`, `nickname`                                         |
| client → server | `input`    | `InputCommand`, once per client tick                           |
| server → client | `welcome`  | own `playerId`, the room's `track` name, the players online    |
| server → client | `rejected` | `reason`: `taken` / `invalid` / `full` / `version`             |
| server → client | `players`  | the players online, sent on every join and leave               |
| server → client | `snapshot` | the whole `GameState` (cars, laps, impacts), 30 times a second |

- **The server trusts nothing**: `parseClientMessage` returns `null` for bad JSON, unknown types,
  missing or wrong-typed fields, non-finite numbers and nicknames longer than 64 characters; it
  clamps inputs (`throttle`/`brake`/`reverse` 0..1, `steer` −1..1) and keeps only the known fields.
  `parseServerMessage` (client side) only checks the JSON and the type: the server is trusted.
- `PlayerInfo` = `id`, `nickname`, `livery` (an index; the client picks the colours, `shared` has no
  view data). `MAX_PLAYERS` = 8 is shared too, so the client can explain `full`.

## Server (2.1c ✅, 2.1e ✅)

`01_packages/server` (Node 26 + `ws` 8). It runs its TypeScript directly (Node's type stripping) with
the extensionless-import loader `01_tools/resolveTs.ts`, shared with the OpenF1 tool: no build step.
Shared code comes in as `@altf1/shared` through the workspace link. Start with `npm run server`
(`node --watch`: restarts on save) on port **8787**, path `/ws` (`PORT` overrides the port).

| File            | Role                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| `Lobby.ts`      | Who is online: nickname registry, player ids, liveries. Pure, tested                       |
| `Room.ts`       | The race: authoritative Test Ring simulation with each player's latest input. Pure, tested |
| `GameServer.ts` | Lobby + room + messages, with no sockets and no timers (tested with fake connections)      |
| `main.ts`       | Adapts `ws` sockets and real time to `GameServer`; hello timeout, heartbeat, logs          |

- **Joining** (`hello`, only before joining; later ones are ignored). `Lobby.join` checks, in this
  order: protocol version → `version`; `checkNickname` → `invalid`; 8 players online → `full`;
  `nicknameKey` already online → `taken`. A rejected client gets `rejected` and its socket is closed
  (code 1008). An accepted one gets `welcome` (its id, the track name, everyone online); the others
  get `players`.
- **Ids** `p1`, `p2`, … are never reused, so a late message from someone who left can't reach a
  newcomer. **Livery** = lowest index nobody online uses (0 = first colour).
- **Inputs** are accepted only from joined players; garbage (`parseClientMessage` → `null`) is
  ignored silently.
- **Leaving** (socket closed, or dropped by the heartbeat): nickname and livery are freed at once,
  the car is removed, the others get `players`.
- **Hello timeout**: a socket that hasn't joined within 10 s is closed. **Heartbeat**: every socket
  is pinged every 5 s; one that didn't answer the previous ping is terminated, so a laptop that
  drops off the network frees its nickname within ~10 s.
- **Time**: `setInterval` at 60 Hz measures real elapsed time and feeds `GameServer.advance`, a
  fixed-step accumulator like the client's `GameLoop` (at most 0.25 s simulated at once).
- **Logs**: one line per join, rejection and leave, e.g. `[lobby] Enea joined as p1 (2 online)`.

## Room (2.1e ✅)

- One room, on the **Test Ring** (`TEST_TRACK`), up to 8 players, no bots. Default tuning
  (`CAR_PARAMS`, `SURFACE_PARAMS`, `COLLISION_PARAMS`, `SLIPSTREAM_PARAMS`): collisions, slipstream
  and lap timing work exactly as in single player, it is the same `stepGame`.
- **Spawn**: `spawnOnGrid` (`shared/src/sim/game.ts`, pure, tested) puts the new car at rest on the
  first grid slot with no car within 6 m, on an out-lap. A slot frees up as soon as its car drives
  away.
- **Inputs**: each player's latest `InputCommand` drives its car every tick (none yet = neutral).
  `reset` (R) is **latched** until the next tick: a one-tick press is never lost when two inputs
  arrive between two ticks, and never applied twice.
- **Rates**: simulation at 60 Hz, a `snapshot` (the whole `GameState`) to every joined player every
  2 ticks = **30 Hz** (`SNAPSHOT_EVERY_TICKS`). The room doesn't tick while it's empty.

## Client lobby (2.1d ✅)

```
Start ─ Multiplayer ─▶ NICKNAME ──Enter──▶ connect /ws ──hello──▶ welcome ─▶ ONLINE · TEST RING
                          ▲                    │                    │            (live list)
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
  page", `unreachable` "Server unreachable — is it running? (npm run server)", `disconnected`.
- **Lobby screen** (`view/menu/LobbyScreen.ts`): `ONLINE · TEST RING` and everyone online, own row
  highlighted ("you"), updated on every `players` message. If the server goes away: "Disconnected
  from the server"; Esc leaves (the reload closes the socket, which frees the nickname).
- `multiplayer/NetClient.ts`: the socket wrapper (typed messages, 5 s connect timeout).
  `multiplayer/start.ts` wires the screens to it. Snapshots already arrive at 30 Hz and are ignored
  until 2.1f draws the race.

## Online race (2.1f, next)

- **2.1 netcode is deliberately simple**: send the input every tick, draw the server's snapshots
  with the existing interpolation (previous/current state + alpha). Without prediction the own car
  answers one round trip late (~20–60 ms over LAN/Tailscale): acceptable to start, fixed in 2.2
  (client-side prediction + reconciliation).
- Camera on the own car; HUD with the own laps (no bot item); a colour per livery index; nickname
  tags over the other cars.

## Dev setup

Two terminals at the repo root:

```
npm run server   # multiplayer server, port 8787 (restarts on save)
npm run dev      # the game (Vite), port 5173, also on LAN/Tailscale
```

Other machines open the dev URL (LAN or Tailscale IP, port 5173): their socket goes through the same
Vite server, nothing else to configure. Two browser tabs on one machine are two players.
