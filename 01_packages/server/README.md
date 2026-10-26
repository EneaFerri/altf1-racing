# @altf1/server

The authoritative multiplayer server: a lobby with unique nicknames and one room on the Test Ring,
simulated with the same `stepGame` from `@altf1/shared` as the game. Node + `ws`, TypeScript run
directly (no build).

```
npm run server   # from the repo root: port 8787, path /ws, restarts on save
```

The game reaches it through Vite's `/ws` proxy (`npm run dev`). Files, flow and rules:
[01_docs/multiplayer.md](../../01_docs/multiplayer.md).
