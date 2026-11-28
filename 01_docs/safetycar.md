# The safety car (R.3)

Owner's request (2026-11-24): in races longer than 10 laps, a car hitting a wall hard brings out
the safety car for one lap, a red GT like the real one (the owner's photo), following the real
rules: no overtaking, the delta to respect while it waits for the leader (R.3b, owner 2026-11-25). **Multiplayer's Grand Prix only** (owner: not in single
player). Web and Mac (the Mac's side: [macos.md](macos.md#online-x7)).

## The rules (`shared/src/race/safetyCar.ts`, numbers in `config/safetyCar.ts`)

`SafetyCarDirector`, run by `GrandPrix` after every race tick when given the room
(`GrandPrixOptions.safetyCar`: the server's `Room`; single player's `OfflineRoom` gives none).

1. **Called** (`deployed`): a wall hit of at least `impactStrength` (28 m/s closing speed: a crash
   that leaves debris) by a car still racing, in a race over `minRaceLaps` (10), before the
   leader's last lap, after lights out. Every car is under the **delta** from now until it leaves
   with the leader.
2. **Waiting, then out** (`deployed` → `out`): at once to the end of the pit lane
   (`pitExitSpot`: the farthest point past the limit line still in the lane and 3.5 m clear of the
   track), still, its lights on, held on the brakes (`withSafetyCar`), waiting for the leader
   (owner, 2026-11-24: "it waits for the race leader; with it behind, it goes"). It goes once the
   leader is no more than `releaseBehind` (120 m) behind it, and drives one lap: the racing line at
   `pace` (75%) of its speed, at most `maxSpeed` (200 km/h), ignoring the traffic (owner,
   2026-11-25: faster, the corners above all; it was 50% and 180 km/h). **The delta ends** as it
   leaves with the leader: the others race to the back of the queue (still no overtaking). While still in
   the pit lane it drives the lane's own road (its pit plan) out onto the track, like a bot leaving
   its box (fixed 2026-11-24: on the race plan it read the lane's samples as the main loop's, and
   turned round at the pit exit back into the lane at Singapore, stuck at Las Vegas and São Paulo;
   tested on every circuit, and the Mac's parity from the pit exit). Past
   `inThisLap` (half its lap) its lights go out: **SAFETY CAR IN THIS LAP**. Its lap counts only
   forward movement (a step back while merging from the lane is none: fixed 2026-11-24, it had
   made it skip going in).
3. **In** (`in`): after most of a lap, between `enterFrom` and `enterTo` (300–40 m) before the pit
   entry, it takes its pit plan into the lane; its car leaves the track once between the limit
   lines (or after 30 s, or if it misses the entry).
4. **Restart** (`restart`): no overtaking until each car crosses the control line (`released`).
5. **Green flag** (owner, 2026-11-24): the moment the leader crosses the control line after the
   safety car went in (`in` or `restart`), with its car in the pit lane or gone, the period is over
   for everyone (its car, if still in the lane, taken off). The board shows `GREEN FLAG · RACING ·
OVERTAKING ALLOWED` in green for 5 s (web and Mac, from the period's end in `GrandPrixInfo`).
6. **Called again** (owner, 2026-11-24): a new crash on its last lap (lights out, `in` or
   `restart`) calls it out again at once, a new period with a new delta: still on the track, it
   stays out for a whole lap more (`out`, no delta: it already leads the field); in the pit lane or gone, it comes out of the pit exit at
   once (`deployed`: its car in the lane taken off and placed there again, since the lane's limit is
   too slow to drive back up it ahead of the leader) and waits for the leader as in 2. A crash while
   it still leads its lap changes nothing.

**The delta** (`SafetyCarDelta`), only while the safety car waits for the leader (`deployed`;
owner, 2026-11-25: once it has left with the leader the others must reach the queue as fast as they
can): each car starts `deltaStart` (1 s) ahead of a reference driving `deltaPace` (60%) of the
racing line's speed; every tick it gains the time it took and loses the time the reference allows
for the metres it drove (not in the pit lane). Falling under `−deltaTolerance` (−0.5 s, i.e. faster
than allowed) starts `deltaGrace` (**5 s**, owner 2026-11-25): back above it in time, nothing;
still under it after 5 s, a **5 s time penalty**, once per period (`graceLeft`; the delta ending in
the meantime, nothing). The same class counts the server's penalties and each player's board.

| Racing line summed (2026-11-25) | Bot's line | Delta   | Safety car (was) |
| ------------------------------- | ---------- | ------- | ---------------- |
| Monza                           | 61.6 s     | 102.7 s | 100.8 s (~123 s) |
| Barcelona                       | 53.7 s     | 89.6 s  | 86.5 s           |
| Monaco                          | 52.9 s     | 88.2 s  | 78.8 s           |
| Mexico City                     | 58.2 s     | 96.9 s  | 89.0 s           |
| Singapore                       | 66.9 s     | 111.4 s | 102.1 s          |
| Las Vegas                       | 71.5 s     | 119.2 s | 112.6 s          |
| São Paulo                       | 52.8 s     | 88.0 s  | 84.3 s           |

**Overtakes**: every pair of cars on the track, the safety car too, is watched from the call to the
end of the restart; two cars within `passWindow` (30 m) whose order swaps between two ticks is an
overtake. Allowed: past a car slower than `slowCar` (15 m/s: crashed, crawling) or punctured,
anything in the pit lane (going in, coming out), and at the restart once released. Otherwise the
attacker must **give the place back** within `giveBackTime` (10 s: the victim by again, and it is
forgotten), else **5 s time penalty**. An overtake on a car that then goes into the pits is void.

**Penalties** add to the driver's race time like the pit stop penalty (`RaceDriver.timePenalty`,
`RaceStanding.penalty` counted at the flag and in the results); the timing tower shows `+5s PEN`
at once (`RaceStanding.timePenalty`). `GrandPrixInfo.incidents` lists them all.

## The safety car itself

A car in the state like any other (`SAFETY_CAR_ID` = `'safety-car'`): it collides, tows, shows on
the minimap; `stepGame` never damages it. Placed by `placeCarAt` (moving at its pace), driven by
`withSafetyCar` (a bot on its plans, `safetyCarPlans`: built once per track and weather, ~10 ms),
applied by the server's `Room.tick` and by the client's `Predictor` alike from
`GrandPrixInfo.safetyCar`, so its car is predicted like the server drives it.

## Look (web)

- **The car** (`view/SafetyCarView.ts`, drawn by `SceneView` for `SAFETY_CAR_ID`): a red GT coupé
  in the game's low-poly look after the owner's photo: black roof and bonnet vents, black grille and
  splitter, headlights, red tail lights, a big rear wing, black wheels with a red line, the white
  flame and `SAFETY CAR` on the flanks, `SAFETY CAR` plates front and back (pixel textures in
  `pixelTexture.ts`). The light bar's two amber lamps flash in turn from the call (waiting at
  the pit exit too) while it leads the field (`SceneView.setSafetyCar`), dark on its last lap and
  going in. No maker's badge or sponsor (real
  trademarks). The web keeps this low-poly look (owner, 2026-11-25: the realistic one on the Mac
  only, see [macos.md](macos.md)).
- **The board** (`view/hud/RaceControlBoard.ts`, texts in `race/raceControlText.ts`), top right,
  compact (200 px wide, small type; owner 2026-11-24: never half the screen): the
  blinking yellow `SAFETY CAR` / `SAFETY CAR IN THIS LAP` / `SAFETY CAR ENDING`, the rule (`NO
OVERTAKING · KEEP ABOVE YOUR DELTA` while it waits, `NO OVERTAKING · CATCH UP THE QUEUE` once it
  leads, `NO OVERTAKING UNTIL THE LINE`, `RACING · OVERTAKING ALLOWED`), the player's `DELTA +1.2`
  (green; red when negative: counted on the predicted world, as the server counts it) and, beating
  it, `BACK ABOVE YOUR DELTA · 4 s` in red, `GIVE THE PLACE BACK TO KIMI · 7 s`, and each penalty
  for 5 s.
- **The GP panel**: `· SAFETY CAR` in its title while it is out; `+5s PEN` beside a driver.
- **The minimap**: an amber dot, "Safety car" in the legend.

## Online

`GrandPrixInfo` carries `safetyCar`, `giveBack` and `incidents` (sent when they change); the
snapshots carry its car. Additive fields: **protocol still v18**; a client that predates them keeps
playing (it draws the safety car as an ordinary car and corrects its position from the snapshots).
The Mac app follows it like the web (R.3 Mac, 2026-11-24).
