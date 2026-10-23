# Roadmap

## Phase 0 — Scaffolding ✅

- Monorepo, tooling, docs, pixel-textured cube rendering in the browser.

## Phase 1 — Single-player (current)

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
     ([circuits.md](circuits.md)). Their scenery comes later.
     - 9b ✅ **Monza** — with the tool (`01_tools/openf1/`) and per-track widths and sectors.
     - 9c **Barcelona** (next), 9d **Monaco**.

Out of scope for Phase 1: audio, menus beyond the track menu, gamepad, networking.

## Phase 2 — Multiplayer (next)

- `01_packages/server`: Node.js + WebSocket, authoritative simulation using `shared`.
- Client-side prediction + reconciliation, interpolation of remote cars.
- Test over Tailscale.

## Later

- Desktop packaging (Tauri/Electron), further tracks beyond the step 9 set, assets, audio.
