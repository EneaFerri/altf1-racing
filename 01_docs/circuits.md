# Real circuits

Monza (step 9b), Barcelona (9c) and Monaco (9d) are the real circuits, built from open data by the
tool in `01_tools/openf1/` (how to run it: its [README](../01_tools/openf1/README.md)). Owner's
rules: **shape** faithful to the real track (the PNGs in `03_F1Circuits/` are the visual
reference), **real widths** (Monza wide, Monaco narrow, varying along the lap), and **lap times
close to reality**: the **Hard bot laps in the real 2025 pole time**, with the frozen car
(baseline v2, see [tuning.md](tuning.md)). The 24 m minimum width applies to imaginary tracks only.

## Sources

| What                               | Source                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Pole lap and sector times          | [OpenF1](https://openf1.org) `laps`, 2025 qualifying                       |
| Where the sectors start, lap speed | OpenF1 `location` (x/y in decimetres, ~3.7 Hz) and `car_data` (~4 Hz)      |
| Road shape (centreline)            | OpenStreetMap `type=circuit` relation (© OpenStreetMap contributors, ODbL) |
| Widths                             | Published figures (below): neither OpenF1 nor OSM has them                 |

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
     `WIDTH_FACTOR` (1.6, the same for every circuit, independent of `scale`);
   - **game limits**, changing the real shape as little as possible: corners tighter than the
     half-width plus the run-off plus 2 m are opened a little (smoothing), then the compiled track
     is checked and only the corners whose wall really folds are opened further; distant sections
     closer than both half-widths plus both run-offs are pushed apart (Monaco's tunnel passes
     under Beau Rivage);
   - **kerbs** (owner's rule): only normal kerbs (grip 0.85, a little slower), never the yellow
     high kerbs that kick the car; and wider than on imaginary tracks: `KERB_BAND` (edge − 0.9 m →
     edge + 1.5 m, 2.4 m instead of 1.6 m), written as the layout's `kerbBand`;
   - control points every ~8–10 m (even spacing keeps the spline round), `sectorPoints` at the real
     sector starts.
4. `calibrate`: drives the Hard bot headless with the game's own simulation and corrects `scale` by
   the time ratio until the lap is within 0.2% of the pole; then prints every level's lap and
   sectors vs reality, wall hits and off-track moments (with where they happen, in real metres).
5. `scenery` (optional, per circuit): grandstands, pit lane and buildings, woods and old raceways
   from OSM → the client's generated `themes/<id>Layout.ts`. Rules in
   [themes.md](themes.md#real-circuits-scenery-from-openstreetmap).

## Adaptation to the game

`scale` is the only lever left with the car frozen: our car tops out at ~250 km/h (F1: ~350) but
corners much harder, so fast circuits shrink and slow ones grow. Widths are not scaled: they
follow reality × `WIDTH_FACTOR`, so the circuits keep their character.

| Circuit   | Real length | Scale | Game length | Real width (m) | Game width (m) | Run-off |
| --------- | ----------- | ----- | ----------- | -------------- | -------------- | ------- |
| Monza     | 5766 m      | 0.858 | 4.93 km     | 10–12          | 16–19.2        | 10 m    |
| Barcelona | 4643 m      | 0.915 | 4.25 km     | 12–14          | 19.2–22.4      | 10 m    |

Real lengths are the OSM centreline's (official: Monza 5793 m, Barcelona 4657 m).

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

### Monza (`layouts/monza.ts`, step 9b)

Shape from OSM relation 284565; target: the 2025 pole, 1:18.792 (car #1, OpenF1 session 9908).
The game's limits moved 23 stations (> 1 m), around the Rettifilo's entry.

| Lap (s)   | Lap   | S1    | S2    | S3    | Walls | Off |
| --------- | ----- | ----- | ----- | ----- | ----- | --- |
| Real pole | 78.79 | 26.26 | 26.48 | 26.05 |       |     |
| Hard      | 78.62 | 24.73 | 26.13 | 27.75 | 0     | 0   |
| Medium    | 80.28 | 25.32 | 26.65 | 28.32 | 0     | 0   |
| Easy      | 94.83 | 29.68 | 31.50 | 33.65 | 0     | 0   |

S3 is 6.5% slow and S1 6% fast: S3 is almost all flat out (Ascari, back straight, Parabolica, start
straight) where our car's lower top speed loses time, made up in S1's chicanes. Tests
(`ai/bot.test.ts`): Hard within 1.5% of the pole, every sector within 7%.

### Barcelona (`layouts/barcelona.ts`, step 9c)

Shape from OSM relation 284540 (the current layout: no chicane before the last corner, as in the
owner's PNG); target: the 2025 pole, 1:11.546 (car #81, OpenF1 session 9967). The game's limits
moved no station: Barcelona's corners are all wider than our walls need.

| Lap (s)   | Lap   | S1    | S2    | S3    | Walls | Off |
| --------- | ----- | ----- | ----- | ----- | ----- | --- |
| Real pole | 71.55 | 21.26 | 28.58 | 21.71 |       |     |
| Hard      | 71.62 | 23.20 | 27.78 | 20.63 | 0     | 0   |
| Medium    | 73.00 | 23.68 | 28.32 | 21.00 | 0     | 0   |
| Easy      | 83.97 | 27.20 | 32.40 | 24.37 | 0     | 0   |

S1 is 9% slow: the ~1 km main straight at up to 328 km/h (our car: ~250) and the fast Renault
(T3); S2 (−3%) and S3 (−5%) win it back in the slower corners. Tests: Hard within 1.5% of the
pole, every sector within 10% (Monza's 7% would need a faster car on straights, and the car is
frozen).

## Re-tuning a circuit

Change `01_tools/openf1/circuits.ts` (widths, run-off, `WIDTH_FACTOR`, `KERB_BAND`), then run
`layout` and `calibrate`, put the scale it finds back in `circuits.ts`, run `layout` again, then
`npm test`. Update the tables above.
