# AltF1 Racing — Project Memory

Arcade F1-style racing game, Krunker.io-style pixel look (low-poly 3D + crisp nearest-filtered
textures), drift-based handling, first/third-person cameras, WASD controls.
Browser-first; must stay easy to wrap as a desktop app later. Multiplayer (client-server) comes later.

## Working rules (top priority)

1. **Keep the repo clean.** Every file has an obvious home (see map below). No stray files, no dead code.
2. **Keep this file and `01_docs/` updated** with every meaningful change. When a topic grows, move it
   to its own `01_docs/*.md` and leave only a link here — this file is the index.
3. **Small steps.** One feature per step, then stop for the owner's review.
4. **Everything in English** (code, comments, docs).
5. **Naming:** project-owned top-level folders get a numeric prefix (`01_docs`, `01_packages`) so they
   sort above generated stuff. `CLAUDE.md` and `README.md` keep their exact names (tools rely on them).

## Stack

TypeScript (strict) · Three.js · Vite · Vitest · ESLint + Prettier · npm workspaces.
Future server: Node.js + `ws`. Rationale in [01_docs/decisions.md](01_docs/decisions.md).

## Repo map

| Path                           | Role                                                         | Notes                                                          |
| ------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------- |
| `01_packages/shared/`          | **Model** — pure, deterministic simulation, types, constants | No `three`, no DOM (enforced by ESLint). Server will reuse it. |
| `01_packages/client/`          | **View + Controller** — rendering, input, game loop          | Vite app, entry `src/main.ts`                                  |
| `01_packages/client/src/view/` | Three.js rendering helpers                                   |                                                                |
| `01_packages/server/`          | Future authoritative multiplayer server                      | Placeholder only                                               |
| `01_docs/`                     | Topic docs                                                   | See index below                                                |

Planned client folders (created when first needed): `src/controller/` (input → `InputCommand`),
`src/core/` (fixed-timestep game loop, platform abstraction).

## Commands

```
npm install        # once
npm run dev        # dev server (also reachable on LAN/Tailscale)
npm test           # Vitest
npm run typecheck  # tsc in every package
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # production build of the client
```

## Generated files (never edit, all git-ignored except the lockfile)

- `node_modules/` — installed libraries. Only one, at the root; Vite's cache lives in
  `node_modules/.vite` (`cacheDir` in `01_packages/client/vite.config.ts`). No package may get its own.
- `01_packages/*/dist/` — output of `npm run build`; safe to delete anytime.
- `package-lock.json` — exact dependency versions. **Committed**, never hand-edited.
- `.DS_Store` — macOS Finder metadata.

`.vscode/settings.json` hides `node_modules`, `dist` and `.DS_Store` from the VS Code file tree.

## Docs index

- [01_docs/architecture.md](01_docs/architecture.md) — MVC split, game loop, data flow
- [01_docs/roadmap.md](01_docs/roadmap.md) — phases and current status
- [01_docs/decisions.md](01_docs/decisions.md) — decision log (why we chose what we chose)

## Current status

Phase 0 done: toolchain + spinning pixel-textured cube. Next: Phase 1 step 1 (see roadmap).
