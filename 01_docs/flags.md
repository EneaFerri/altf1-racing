# Debris and yellow flags (R.2)

Owner's request (2026-11-24): a car hitting a wall hard leaves debris on the track for 15 s and
brings out the yellow flag in that sector. **The Grand Prix, qualifying and race, single player and
online** (the safety car, R.3, is online only: [safetycar.md](safetycar.md)). Web and Mac.

## The rule (`shared/src/race/flags.ts`, numbers in `config/flags.ts`)

`stepYellowFlags`, run by `GrandPrix` after every tick of qualifying and the race: a wall hit of at
least `debrisImpact` (22 m/s closing speed; the safety car needs 28) by one of the GP's drivers
puts out a `YellowFlag`: the hit's point and main-loop progress, its timing sector (`sectorAt`),
from its tick for `seconds` (15 s). One crash is one flag: the same car's hits within `sameCrash`
(2 s, scraping along the wall) add none. A new session (every phase change) starts with a clean
track. `GrandPrixInfo.yellowFlags` carries them (sent when one comes or goes), so every player sees
the same; no protocol change (an additive field: older clients ignore it).

The flag is told, not enforced: race control says `SLOW DOWN, NO OVERTAKING`; there is no penalty
(the safety car's rules are the ones enforced).

## Look

- **Debris** (`view/TrackDebris.ts`, pieces by `debrisLayout` in `shared/src/race/flags.ts`, pure
  and tested, shared with the Mac): 40 pieces
  of carbon, of the crashed car's paint and white bits, one in six a bigger chunk (a wing's piece,
  an endplate), strewn on the asphalt from 4 m before the hit to 35 m after it, most near the wall
  it came off, some thrown across the road. Seeded by the crash, so every player sees the same
  pieces in the same places. Gone with the flag.
- **A track marshal** waving the yellow flag 120 m before the crash, on the other side of the road:
  the chequered flag's marshal (`FlagMarshal` with a `FlagMarshalSpot`) in the marshals' orange,
  her flag yellow (`YELLOW_MARSHAL_COLORS`).
- **Race control** (`view/hud/RaceControlBoard.ts`, texts `race/raceControlText.ts`), top right: a
  yellow strip `YELLOW FLAG · SECTOR 2 · SLOW DOWN, NO OVERTAKING` (`SECTORS 1 & 3` with more), over
  the safety car's messages when it is out too.
- **The minimap**: the sectors under a yellow flag drawn yellow (`Minimap.setYellowSectors`).

## Mac

- **The model** (`AltF1Core/Race/Flags.swift`): `stepYellowFlags`, `sectorAt`, `yellowSectors`,
  `debrisLayout` (the same seeded numbers: every player, web or Mac, sees the same pieces); single
  player's `GrandPrix` runs them like the web's (`GrandPrixInfo.yellowFlags`), online they come
  from the server. Parity: `flags.json` (the flags tick by tick, every crash's pieces) is identical.
- **The look**: `Render/TrackDebrisEntity.swift`: the pieces in PBR (carbon, the car's clear-coated
  paint, white) and, 120 m before the crash on the other side, a marshals' post: a light panel
  flashing yellow towards the oncoming cars (as at today's circuits) and a marshal's yellow flag
  waving (its cloth in hinged strips). Race control's board (`RaceControl.swift`) shows the yellow
  strip in both Grand Prix screens; the minimap draws the sectors yellow.
- **Dev**: `ALTF1_YELLOW_FLAG=<m>` (Debug): a crash that far ahead of the player's start, to see it.
