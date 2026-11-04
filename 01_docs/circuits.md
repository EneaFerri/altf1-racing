# Real circuits

Monza (step 9b), Barcelona (9c), Monaco (9d) and Mexico City (2.4a) are the real circuits, built from open data by the
tool in `01_tools/openf1/` (how to run it: its [README](../01_tools/openf1/README.md)). Owner's
rules: **shape** faithful to the real track (the PNGs in `03_F1Circuits/` are the visual
reference), **real widths** (Monza wide, Monaco narrow, varying along the lap), and **lap times
close to reality**: the **Hard bot laps in the real 2025 pole time**, with the frozen car
(baseline v3, see [tuning.md](tuning.md)). The 24 m minimum width applies to imaginary tracks only.

## Sources

| What                               | Source                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Pole lap and sector times          | [OpenF1](https://openf1.org) `laps`, 2025 qualifying                         |
| Where the sectors start, lap speed | OpenF1 `location` (x/y in decimetres, ~3.7 Hz) and `car_data` (~4 Hz)        |
| Road shape (centreline)            | OpenStreetMap `type=circuit` relation (© OpenStreetMap contributors, ODbL)   |
| Widths                             | Published figures (below); where none exist, measured on OSM's asphalt areas |

Two findings shaped the method:

- **OpenF1 positions are map-matched**: every car is snapped onto one reference line (the lateral
  spread of ~1000 laps of qualifying and race at Monza is under 10 cm). So OpenF1 gives no width, and
  its line is a **racing line**: through chicanes it is 8–10 m off the road's centre, so a track
  built on it has chicanes far too smooth (Roggia taken at 200 km/h instead of 113).
- **OSM's centreline** is the road itself, traced from aerial imagery. Registered onto the OpenF1
  lap (the frames match: rotation 0) it differs by 2.1–2.4 m on average, up to 8–14 m in chicanes
  and hairpins: exactly the racing line cutting the corners.

So the **shape comes from OSM**, ordered and placed by the OpenF1 pole lap, and **times, sectors
and speed from OpenF1**.

## Pipeline

1. `fetch`: the pole lap of the qualifying (OpenF1) and the circuit's OSM relation, saved in
   `01_tools/openf1/data/<id>.openf1.json` / `<id>.osm.json` (committed, rebuilds work offline).
2. `profile` → `data/<id>.json`, real metres: the lap resampled every 5 m; the OSM ways registered
   onto it (iterative closest point) and each lap point moved onto the nearest OSM segment (within
   15 m); the lap's speed, its corners (speed minima) and the sector starts (where the car was at
   S1 and S1 + S2) carried over to the centreline's distances; and `osmFrame`, the rigid fit
   (rotation + shift) of the OSM centreline onto the lap, so any other OSM feature lands in the
   same frame (scenery).
3. `layout` → `01_packages/shared/src/track/layouts/<id>.ts` (generated: never edit by hand), plus
   a preview from above (`01_tools/openf1/preview/<id>.png`, git-ignored):
   - oriented like the owner's PNG (`lineDirection`), scaled by `scale`, start line at the origin;
     the real `(x, y north)` becomes the game's `(x, z = −y)`, so clockwise stays clockwise;
   - **widths**: the real width at each point (eased between the circuit's width marks) ×
     `WIDTH_FACTOR` (1.6, independent of `scale`), or the circuit's own `widthFactor` (Monaco 1.2);
   - **game limits**, changing the real shape as little as possible: corners tighter than the
     half-width plus the run-off plus 2 m are opened a little (smoothing), then the compiled track
     is checked and only the corners whose wall really folds are opened further; distant sections
     closer than both half-widths plus both run-offs are pushed apart; **hairpins** (stations
     < 150 m apart along the lap facing opposite ways, e.g. Monaco's Grand Hotel) get their legs
     spread to 1.25 × both minimum radii instead of being smoothed (smoothing tightens a U-turn),
     so the turn between them can be round; pushes stop within 1 cm of their target;
   - **kerbs** (owner's rule): only normal kerbs (grip 0.85, a little slower), never the yellow
     high kerbs that kick the car; and wider than on imaginary tracks: `KERB_BAND` (edge − 0.9 m →
     edge + 1.5 m, 2.4 m instead of 1.6 m), written as the layout's `kerbBand`;
   - control points every ~8–10 m (even spacing keeps the spline round), `sectorPoints` at the real
     sector starts.
4. `calibrate`: drives the Hard bot headless with the game's own simulation and corrects `scale` by
   the time ratio until the lap is within 0.2% of the pole; then prints every level's lap and
   sectors vs reality, wall hits and off-track moments (with where they happen, in real metres).
5. `scenery` (optional, per circuit): grandstands, pit lane and buildings, woods and old raceways
   from OSM (on a town circuit, `town: true`, also every building with its height, the sea, piers,
   pools, trees and the tunnel; `stands` places temporary grandstands by hand) → the client's
   generated `themes/<id>Layout.ts`. Rules in
   [themes.md](themes.md#real-circuits-scenery-from-openstreetmap).

## Adaptation to the game

`scale` is the only lever left with the car frozen: our car tops out at ~283 km/h (F1: ~350) but
corners much harder, so fast circuits shrink and slow ones grow. Widths are not scaled: they
follow reality × `WIDTH_FACTOR`, so the circuits keep their character. **Mexico City** uses × 1.4
(owner's choice). **Monaco** uses × 1.2
(owner's choice): our car is 2.2 m wide, an F1 2 m, so the road holds as many cars side by side as
the real one (4.4–6.5): overtaking stays as hard as in reality.

| Circuit     | Real length | Scale  | Game length | Real width (m) | Game width (m) | Run-off |
| ----------- | ----------- | ------ | ----------- | -------------- | -------------- | ------- |
| Monza       | 5766 m      | 0.948  | 5.45 km     | 10–12          | 16–19.2        | 10 m    |
| Barcelona   | 4643 m      | 1.011  | 4.69 km     | 12–14          | 19.2–22.4      | 10 m    |
| Monaco      | 3281 m      | 1.133  | 3.72 km     | 8–12           | 9.6–14.4       | 3 m     |
| Mexico City | 4289 m      | 0.9858 | 4.25 km     | 10.8–15        | 15.1–21        | 4 m     |

Real lengths are the OSM centreline's (official: Monza 5793 m, Barcelona 4657 m, Monaco 3337 m,
Mexico City 4304 m).

### Widths (published, then per section)

Few per-section figures are published; each circuit has its published range, and per-section
values (`widths` in `01_tools/openf1/circuits.ts`, by real distance and corner name) are estimates
within that range unless marked with their own source there.

- **Monza**: 10–12 m ([monzanet.it](https://www.monzanet.it/en/circuit/)). 12 m on the start
  straight, its braking zone and the Parabolica; 11 m in the Curva Grande, Serraglio and back
  straight; 10 m in the chicanes and the Lesmos.
- **Barcelona**: 12–14 m (motogp.com 12 m, gedlich-racing.com 12–14 m). 14 m on the main
  straight and its braking zone, 13 m through turns 1–2 and on the back straight, 12 m in every
  other corner (Renault, Repsol, Seat, 7–8, Campsa, La Caixa, Banc Sabadell, 13, New Holland).
- **Monaco**: 8–12 m (kymillman.com, with measured spots: start straight 12, Mirabeau Haute 9.45,
  Portier 8.87, Nouvelle Chicane 9.3 → 10.12). Estimates elsewhere: 9–10 m through the town, 8 m at
  La Rascasse (the published minimum), 12 m at the Piscine entry (turns 13–14: the fast left-right
  where the bots ran wide at 9–10 m).

### Monza (`layouts/monza.ts`, step 9b)

Shape from OSM relation 284565; target: the 2025 pole, 1:18.792 (car #1, OpenF1 session 9908).
The game's limits moved 20 stations (> 1 m), around the Rettifilo's entry.

| Lap (s)   | Lap   | S1    | S2    | S3    | Walls | Off |
| --------- | ----- | ----- | ----- | ----- | ----- | --- |
| Real pole | 78.79 | 26.26 | 26.48 | 26.05 |       |     |
| Hard      | 78.50 | 24.80 | 26.28 | 27.42 | 0     | 0   |
| Medium    | 80.03 | 25.33 | 26.77 | 27.93 | 0     | 0   |
| Easy      | 93.30 | 28.97 | 31.45 | 32.88 | 0     | 0   |

S3 is 5% slow and S1 5.5% fast: S3 is almost all flat out (Ascari, back straight, Parabolica, start
straight) where our car's lower top speed loses time, made up in S1's chicanes. Tests
(`ai/bot.test.ts`): Hard within 1.5% of the pole, every sector within 7%.

### Barcelona (`layouts/barcelona.ts`, step 9c)

Shape from OSM relation 284540 (the current layout: no chicane before the last corner, as in the
owner's PNG); target: the 2025 pole, 1:11.546 (car #81, OpenF1 session 9967). The game's limits
moved no station: Barcelona's corners are all wider than our walls need.

| Lap (s)   | Lap   | S1    | S2    | S3    | Walls | Off |
| --------- | ----- | ----- | ----- | ----- | ----- | --- |
| Real pole | 71.55 | 21.26 | 28.58 | 21.71 |       |     |
| Hard      | 71.53 | 23.08 | 27.72 | 20.73 | 0     | 0   |
| Medium    | 72.77 | 23.53 | 28.20 | 21.03 | 0     | 0   |
| Easy      | 82.85 | 26.28 | 32.55 | 24.02 | 0     | 0   |

S1 is 8.5% slow: the ~1 km main straight at up to 328 km/h (our car: ~283) and the fast Renault
(T3); S2 (−3%) and S3 (−4.5%) win it back in the slower corners. Tests: Hard within 1.5% of the
pole, every sector within 10% (Monza's 7% would need a faster car on straights, and the car is
frozen).

### Baseline v3 recalibration (2026-10-23)

With `maxSpeed` 80 → 95 the Hard bot lapped ~8% under the poles, so both scales grew ~10%
(Monza 0.858 → 0.948, Barcelona 0.915 → 1.011). The owner asked that the tight corners stay hard:
radii grow 10% but corner speed only with its square root, while the straights end much faster, so
the braking gets bigger. Hard bot, top speed before the corner → minimum (km/h):

| Corner               | v2 (old scale) | v3 (new scale) |
| -------------------- | -------------- | -------------- |
| Monza, Rettifilo     | 256 → 151      | 289 → 158      |
| Monza, Roggia        | 253 → 141      | 284 → 140      |
| Monza, Ascari        | 254 → 155      | 286 → 178      |
| Barcelona, turn 1    | 255 → 141      | 288 → 158      |
| Barcelona, Seat (T5) | 226 → 124      | 251 → 139      |
| Barcelona, La Caixa  | 248 → 121      | 278 → 132      |

### Monaco (`layouts/monaco.ts`, step 9d)

Shape from OSM relation 148194; target: the 2025 pole, 1:09.954 (car #4, OpenF1 session 9975).
Oriented by the owner's PNG (`lineDirection` 80: up the start straight). The game's limits moved
30 stations (> 1 m), mostly the Grand Hotel hairpin's legs (spread so its walls don't fold).

| Lap (s)   | Lap   | S1    | S2    | S3    | Walls | Off |
| --------- | ----- | ----- | ----- | ----- | ----- | --- |
| Real pole | 69.95 | 18.22 | 33.25 | 18.48 |       |     |
| Hard      | 70.05 | 19.22 | 32.05 | 18.78 | 0     | 0   |
| Medium    | 71.05 | 19.53 | 32.48 | 19.03 | 0     | 0   |
| Easy      | 91.65 | 25.60 | 41.07 | 24.98 | 0     | 0   |

S1 is 5.5% slow (the start straight and the climb to Casino), S2 3.6% fast (the slow corners: our
car corners harder). Tests: Hard within 1.5% of the pole, every sector within 7%.

The tricky corners stay tricky (owner's request): Hard bot, top speed before → minimum (km/h):

| Corner              | Real F1 minimum | Hard bot  |
| ------------------- | --------------- | --------- |
| Sainte Dévote       | 121             | → 125     |
| Mirabeau Haute      | 84              | 233 → 106 |
| Grand Hotel hairpin | 47              | 233 → 72  |
| Portier             | 88              | 165 → 100 |
| Nouvelle Chicane    | 69              | 273 → 109 |
| La Rascasse         | 65              | 225 → 90  |

### Mexico City (`layouts/mexico.ts`, step 2.4a)

Autódromo Hermanos Rodríguez. Shape from OSM relation 16251935 ("Mexican Grand Prix"; not
10715575, the Formula E layout); target: the 2025 pole, 1:15.586 (car #4, OpenF1 session 9873).
Oriented by the owner's `Mexico carbon.png` (`lineDirection` 20: up-right along the main straight),
clockwise. Real widths × 1.4 (owner's choice). Run-off 4 m: with Monza's 10 m the walls fold in
the tight corners (real radii 14–20 m: turns 4–6 and the stadium), and the sharp corners (below)
are as tight as it lets them be. The game's limits moved 32 stations (> 1 m), around the sharp
corners.

**Sharp corners** (owner's request after the first test, "you must brake for the 90° corners"):
our car turns far tighter than an F1 (up to 2.7 rad/s; the slide scrubs speed by itself), so a
real 90° corner with a round 17–24 m apex could be taken lifting, on a wide line. Turns 1, 4, 5, 6,
12, 13 and 16 are rebuilt (`sharpCorners` in `circuits.ts`, `sharpen` in `generate.ts`) as their
two legs, straight on from `span` m either side of the apex, joined by the tightest arc the walls
allow (half-width + run-off + 3 m). The shape stays the real one; only the apexes are sharper.
Hard bot, top speed before → minimum (km/h):

| Corner      | Real F1 minimum | Before (round) | Sharp     |
| ----------- | --------------- | -------------- | --------- |
| Turn 1      | 108             | 289 → 129      | 289 → 85  |
| Turn 4      | 90              | 276 → 98       | 274 → 83  |
| Turn 5      | 74              | 276 → 97       | 274 → 84  |
| Turn 6      | 86              | 170 → 106      | 173 → 76  |
| Turn 12     | 137             | 276 → 111      | 273 → 104 |
| Turn 13     | 68              | 194 → 93       | 190 → 82  |
| Turns 16–17 | 105             | 181 → 98       | 176 → 86  |

Slower corners need a shorter track for the pole time: the scale went from 1.0325 to 0.9858.

**Widths, measured**: no figure is published (searched: FIA, organisers, circuit guides). OSM traces
the asphalt as `area:highway=raceway` polygons from aerial imagery. Across the centreline at every
station, the width between their edges, as the median of each ~100 m. Spots where the asphalt
widens into run-off at a corner are left out. Result: 14.7–15 m on the main straight, 11–12.6 m
from turn 1 to the stadium, 10.8 m on the straight to turn 4 (the narrowest), 14.6 m out of the
Peraltada (`widths` in `circuits.ts`, each marked with that source).

| Lap (s)   | Lap   | S1    | S2    | S3    | Walls | Off |
| --------- | ----- | ----- | ----- | ----- | ----- | --- |
| Real pole | 75.59 | 26.92 | 29.11 | 19.56 |       |     |
| Hard      | 75.48 | 28.90 | 27.77 | 18.82 | 0     | 0   |
| Medium    | 76.62 | 29.42 | 28.18 | 19.02 | 0     | 0   |
| Easy      | 91.23 | 33.58 | 34.27 | 23.38 | 0     | 0   |

S1 is 7.4% slow: the 1.2 km main straight at up to 360 km/h in reality (thin air at 2240 m; our
car: ~283). S2 (−4.6%) and S3 (−3.8%) win it back in the corners. Tests: Hard within 1.5% of the pole,
every sector within 10% (as Barcelona).

## Adding a circuit

One circuit per step (Phase 2.4, [roadmap.md](roadmap.md)). Every circuit is offered in every mode:

1. The owner's PNG in `03_F1Circuits/` (shape and orientation).
2. An entry in `CIRCUITS` (`01_tools/openf1/circuits.ts`): OpenF1 qualifying session
   (`sessions?year=2025&country_name=…`), the OSM `type=circuit` relation of the GP layout, widths
   (published, else measured as Mexico City's), the width factor the owner chose, run-off,
   `lineDirection` from the PNG; sharp corners, stadiums, hand-placed grandstands, surroundings or
   town layers if it needs them.
3. `fetch` → `profile` → `layout` → `calibrate` (scale back into `circuits.ts`) → `layout` →
   `scenery --fetch` → `layout` once more, now with the pit lane (README); check `preview/<id>.png`
   against the PNG and `preview/<id>-pitlane.png` ([pitlane.md](pitlane.md)).
4. Shared: export the layout in `track/layouts/index.ts` and add it to `TRACKS` (single player)
   and `GP_TRACKS` (online: Free practice, Time trial, Grand Prix; the server's rooms follow).
5. Client: `themes/<id>.ts` (`realCircuitTheme`), mapped in `themes/theme.ts`.
6. Tests: the pole in `REAL_POLES` (`ai/bot.test.ts`), the scenery case in
   `themes/realCircuitLayouts.test.ts`; every-level bot laps, the grid fit and the room list follow
   `TRACKS`/`GP_TRACKS` on their own.
7. Docs: this file (table, section), [themes.md](themes.md), the tool's README, `CLAUDE.md`.

## Re-tuning a circuit

Change `01_tools/openf1/circuits.ts` (widths, run-off, `WIDTH_FACTOR` or `widthFactor`, `KERB_BAND`), then run
`layout` and `calibrate`, put the scale it finds back in `circuits.ts`, run `layout` again, then
`npm test`. Update the tables above.
