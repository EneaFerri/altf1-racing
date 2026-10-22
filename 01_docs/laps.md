# Laps & HUD

Lap timing is simulation state (`01_packages/shared/src/sim/laps.ts`), so the future server times laps
exactly like the client does. The HUD (`01_packages/client/src/view/hud/Hud.ts`) only displays it.

## Session: free practice

Laps never end. The car starts on the grid behind the line in an **out-lap**; the first time it
crosses the start line the clock starts on lap 1. After that, every crossing closes a lap and opens
the next one. There are no start lights and no finish (a race mode can come later).

## Sectors = checkpoints

- `TRACK_RULES.sectorCount` (3) sectors of equal length along the centreline. Sector `k` ends at
  `(k + 1) · length / 3`; the last one ends on the start line (distance 0, sample 0).
- Every tick, after collisions, `stepGame` gives each car's `LapState` its new progress
  (`locateOnTrack(position).distance`).
- **Crossing rule**: progress change `delta` is wrapped into (−L/2, L/2], and only forward movement
  counts. A boundary `b` is crossed when `0 < (b − previous) mod L ≤ delta`.
- **Only the expected boundary counts**: the end of the current sector, or the start line during the
  out-lap. Driving backwards, reversing over a line and coming back, or skipping a sector never times
  anything. The walls already prevent real shortcuts.
- Times are **integer ticks** (60 Hz, 16.7 ms resolution): deterministic, the same on every machine.
- A teleport (`placeCar`: the bot switched on with B, the dev dummy with F4) restarts that car's
  out-lap, so it can't count as a crossing.
- **Visible on track** (`TrackView`): a gantry where each sector starts. It has two posts just behind
  the walls and a board across the whole track labelled `S1` / `S2` / `S3` in pixel glyphs (yellow
  stripes, readable from far away). S2 and S3 also get a yellow line on the asphalt; S1 is the
  chequered start line.

## Validity

A lap becomes **invalid if the car resets (R) during it**: the reset puts you on the nearest
centreline point, which could otherwise be used to cut. Invalid laps still show as LAST (struck
through), but they never become the best lap and their sectors never become best sectors. There is
no track-limits rule.

## `LapState` (one per car, `GameState.laps`, same order as `cars`)

| Field                              | Meaning                                               |
| ---------------------------------- | ----------------------------------------------------- |
| `distance`                         | Progress at the last tick (m)                         |
| `sector`                           | Sector being driven, `-1` = out-lap                   |
| `lapStartTick` / `sectorStartTick` | When the current lap / sector began                   |
| `currentSectors`                   | Ticks of the sectors completed in this lap            |
| `valid`                            | False after a reset in this lap                       |
| `laps`                             | Completed laps                                        |
| `lastLap` / `bestLap`              | `{ ticks, sectors, valid }`; best = fastest valid lap |
| `bestSectors`                      | Fastest time per sector across all valid laps         |

## HUD (top centre)

One slim translucent strip, system sans-serif with tabular figures:

`LAP 3 │ 1:23.4 │ ▬ ▬ ▬ │ LAST 1:24.102 │ BEST 1:22.981 │ 212 km/h │ ● BOT MEDIUM`

- `OUT LAP` before the first crossing. A red `INVALID` tag appears while the current lap is invalid.
- The sector bars light up as each sector is done. **Purple** = best ever for that sector,
  **green** = faster than that sector in your best lap, **yellow** = slower, **grey** = invalid lap.
  Comparisons use the bests as they were when the lap started.
- Under the strip, a chip shows for 3 s after each sector: the gap to the best lap at that point
  (`S2 −0.214`), or the sector time while there is no best lap yet. At the line it also shows the lap time.
- `● BOT <level>` at the end shows the bot's level (`OFF` greyed when off, see [bot.md](bot.md)).
  The bot is timed in the simulation like any car, but its times are never shown.
- The DOM is touched only when a text changes. `pointer-events: none`, so it never blocks input.
