# Decision Log

## 2026-10-21 — Stack: TypeScript + Three.js + Vite

- Everything is plain code (no editor-only scene/binary files) → easy to generate and review.
- Three.js is what Krunker.io uses; the look we want is native to it.
- One language for client and future server → the simulation is shared 1:1.
- Rejected: Godot/Unity (editor-centric workflow, harder to review diffs, no shared server code).

## 2026-10-21 — Custom arcade physics, no physics engine

- Drift feel needs direct control over grip; a rigid-body engine fights that.
- Deterministic and unit-testable. Rapier may be added later for collisions only.

## 2026-10-21 — Product choices (from owner)

- Platform: browser first, keep desktop packaging easy.
- Look: Krunker-faithful (low-poly, nearest-filtered textures, full-res render).
- Third-person camera: chase cam by default.
- Language: English everywhere.
