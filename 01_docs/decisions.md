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

## 2026-10-21 — SI units and ground-plane axes

- The Model uses metres, seconds and radians; km/h exists only in the View.
- 2D vectors are `{ x, z }` (Three.js ground axes) and `heading` 0 = −Z, so `rotation.y = heading`
  with no conversion layer — fewer sign bugs between Model and View.

## 2026-10-21 — Kinematic car model instead of a tyre model

- Velocity split into forward/lateral parts, lateral part damped by `lateralGrip`; yaw driven
  directly by steering and speed. Few, intuitive parameters (see physics.md), easy to tune for fun.
- A tyre/slip-curve model (Pacejka-style) would be more realistic but harder to tune and to make drift "easy".
- Steering smoothing lives in the Model, so the server reproduces it exactly.
