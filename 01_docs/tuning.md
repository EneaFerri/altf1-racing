# Tuning baseline

All feel-related numbers have one home each and are the game's defaults:

| Values             | File                                            | Docs                               |
| ------------------ | ----------------------------------------------- | ---------------------------------- |
| `CAR_PARAMS`       | `01_packages/shared/src/config/car.ts`          | [physics.md](physics.md)           |
| `COLLISION_PARAMS` | `01_packages/shared/src/config/collision.ts`    | [collisions.md](collisions.md)     |
| `SURFACE_PARAMS`   | `01_packages/shared/src/config/surfaces.ts`     | [track.md](track.md)               |
| `CAMERA_PARAMS`    | `01_packages/client/src/view/cameras/params.ts` | [architecture.md](architecture.md) |

## Status flag

`TUNING_BASELINE` in `01_packages/shared/src/config/tuning.ts` says how settled these values are:

- `status`: `'provisional'` (current baseline, expected to change) or `'final'`.
- `version`: bumped at every re-freeze. `frozenOn`: date of the last freeze.

Current: **baseline v1, provisional**, frozen on 2026-10-22 at the end of Phase 1 step 7 (the owner
confirmed the values in the repo at that point as defaults, knowing they are not final).

The label (`baseline v1 provisional`) shows in the dev tuning panel title (F2) and in the debug
overlay (F3), so it's always clear which baseline is being driven. Production builds are unaffected.

## Re-tuning workflow

1. `npm run dev`, drive, press **F2** (tuning panel) and **F3** (telemetry).
2. Move the sliders; changes apply on the next tick. **Reset to defaults** returns to the frozen baseline.
3. When happy, press **Copy as code**: the new values are logged to the console (and copied to the
   clipboard on localhost) grouped per file.
4. Paste each block into its file from the table above.
5. In `config/tuning.ts` bump `version`, set `frozenOn`, and set `status: 'final'` once the values are final.
6. If behaviour changed, update the measured-behaviour tables in `physics.md` / `collisions.md` and add
   a line to [decisions.md](decisions.md).
7. `npm test`: some tests measure feel (e.g. drift angle, top speed) and may need new expectations.
