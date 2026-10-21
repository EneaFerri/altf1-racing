# Roadmap

## Phase 0 — Scaffolding ✅

- Monorepo, tooling, docs, pixel-textured cube rendering in the browser.

## Phase 1 — Single-player on a test track (current)

1. Game loop (fixed timestep + interpolation) and keyboard Controller.
2. Arcade car physics in `shared` (acceleration, braking, steering) with unit tests.
3. Drift model (lateral grip loss on handbrake/high slip, countersteer recovery).
4. Trivial flat test track (ring + a hairpin), walls/collisions.
5. Chase camera + first-person camera, toggle with C.
6. Minimal HUD (speed, lap timer).
7. Feel tuning pass.

## Phase 2 — Multiplayer

- `01_packages/server`: Node.js + WebSocket, authoritative simulation using `shared`.
- Client-side prediction + reconciliation, interpolation of remote cars.
- Test over Tailscale.

## Later

- Desktop packaging (Tauri/Electron), more tracks, assets, audio.
