# Tyres: soft and medium (T.1)

**Grand Prix only** (every track built with its pit lane), web and Mac, single player and online.
Owner's request (2026-11-23): at a stop choose softs (red) or mediums (yellow); softs last fewer
laps but grip more and pull out of the bends better. Owner's choices: web + Mac and online; a
gradual loss with wear; keys 1 / 2 during the stop; every car starts on mediums, the bots choose by
their stint.

## Model

- `config/tyres.ts` (`TYRE_PARAMS`, provisional until the owner's test):

  | Compound | Grip and turning | Traction | Life   |
  | -------- | ---------------- | -------- | ------ |
  | Soft     | ×1.05            | ×1.05    | 4 laps |
  | Medium   | ×1               | ×1       | 9 laps |

  A fully worn set has lost `wornLoss` = 10% of grip, turning and traction; less wear,
  proportionally less (a soft at the end of its life: 1.05 × 0.9 ≈ 0.95).

- `sim/tyres.ts`: `TyreState` (`compound`, `wear` 0…1), `NEW_MEDIUMS`, `fitTyres`,
  `tyredParams` (the car's `lateralGrip` and `maxYawRate` × grip: faster through the bends;
  `engineAccel` × traction: out of them), `wearTyres` (metres driven ÷ (life × the lap's length)).
- `SimContext.tyres` (set by `onlineSimContext` with the pit rules, so only in the Grand Prix);
  `CarState.tyres`, optional: absent = new mediums, set from the first tick of a race with tyres.
  `stepGame` applies them after the damage (`damagedParams`), wears them by the distance of the
  tick (before the pit limiter), keeps them through R.
- **Stops** (`sim/pit.ts`): stopping in the box fits a new set of the same compound; while held there
  an input's `compound` (soft / medium, one tick) fits a new set of that one. Ignored anywhere else.
- **Bots** (`ai/squad.ts`, `botCompound`): at a stop, softs when the stint ahead (to their next
  scheduled stop, else the flag) is no longer than the softs' life, else mediums. In qualifying they
  never stop.

## Controls and look

- **Keys** 1 / 2 while stopped in the box (qualifying or race; on the grid they still choose the
  distance). The choice rides on the next tick's input (`KeyboardController.chooseCompound`, the
  Mac's `Keyboard.chooseCompound`).
- **HUD**: web: `SOFT 37%` under the timing strip (the compound's colour on its left), and
  `PIT STOP 2.1 · 1 SOFT 2 MEDIUM` in the box; Mac: `TyrePanel` above the speed (a ring in the
  compound's colour, the wear; in the box the stop's seconds and the two choices).
- **The cars**: the sidewalls' band in the compound's colour (web: `TYRE_BANDS`; Mac: the band's
  material); in the rain the web keeps the wets' blue band.

## Online

`InputCommand.compound` goes to the server with the input (`parseClientMessage` keeps a known
compound and refuses any other); **protocol v18**. The snapshot carries `CarState.tyres` as part of
the state, so prediction runs them too.

## Parity (Mac)

The Swift port (`Config/TyreParams.swift`, `Sim/Tyres.swift`, `Game`, `Pit`, `Squad`) is checked by
the sim fixtures: Monaco and São Paulo run with tyres, the car stopped in its box fits softs
(`fixtures.ts`); `protocol.json` has an input with a compound.
