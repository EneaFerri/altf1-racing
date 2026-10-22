# Tuning baseline

All feel-related numbers have one home each and are the game's defaults:

| Values             | File                                            | Docs                               |
| ------------------ | ----------------------------------------------- | ---------------------------------- |
| `CAR_PARAMS`       | `01_packages/shared/src/config/car.ts`          | [physics.md](physics.md)           |
| `COLLISION_PARAMS` | `01_packages/shared/src/config/collision.ts`    | [collisions.md](collisions.md)     |
| `SURFACE_PARAMS`   | `01_packages/shared/src/config/surfaces.ts`     | [track.md](track.md)               |
| `BOT_PARAMS`       | `01_packages/shared/src/config/bot.ts`          | [bot.md](bot.md)                   |
| `CAMERA_PARAMS`    | `01_packages/client/src/view/cameras/params.ts` | [architecture.md](architecture.md) |

## Status flag

`TUNING_BASELINE` in `01_packages/shared/src/config/tuning.ts` says how settled these values are:

- `status`: `'provisional'` (current baseline, expected to change) or `'final'`.
- `version`: bumped at every re-freeze. `frozenOn`: date of the last freeze.

Current: **baseline v2, final**, frozen on 2026-10-22 after Phase 1 step 9a.5: grip-only handling
(no drift), brake with pressure, the owner's F2 values (`maxYawRate` 2.7, `yawResponse` 9.5) and the
re-measured bots. The owner drove it and confirmed it as the **reference setup**: future tuning starts
from here, and any change to these values bumps the version (v3, …). Git tag: `baseline-v2`.
(v1, provisional, was frozen at the end of step 7.)

The label (`baseline v2 final`) shows in the dev tuning panel title (F2) and in the debug
overlay (F3), so it's always clear which baseline is being driven. Production builds are unaffected.

## Re-tuning workflow

1. `npm run dev`, drive, press **F2** (tuning panel) and **F3** (telemetry).
2. Move the sliders; changes apply on the next tick. **Reset to defaults** returns to the frozen baseline.
3. When happy, press **Copy as code**: the new values are logged to the console (and copied to the
   clipboard on localhost) grouped per file.
4. Paste each block into its file from the table above.
5. In `config/tuning.ts` bump `version`, set `frozenOn`, and set `status: 'final'` once the values are final.
6. If behaviour changed, update the measured-behaviour tables in `physics.md` / `collisions.md` /
   `bot.md` (car changes move the bot's lap times too) and add
   a line to [decisions.md](decisions.md).
7. `npm test`: some tests measure feel (e.g. top speed, bot lap times) and may need new expectations.
