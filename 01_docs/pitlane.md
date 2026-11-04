# Pit lane (Phase 4)

**Grand Prix only.** Every real circuit (`GP_TRACKS`) has its real pit lane in its data; only the
Grand Prix drives it (4f), every other mode keeps it as scenery behind the wall. Plan:
[roadmap.md](roadmap.md#phase-4--pit-lane-and-car-damage-grand-prix-only); damage, the reason to
come in: [damage.md](damage.md).

## Data (4e)

Generated, never written by hand: `01_tools/openf1/pitLane.ts` (`pitLaneOf`), run by `layout.ts`
when the circuit's OSM scenery is there, writes `pitLane` into the shared layout
(`track/layouts/<id>.ts`, a `PitLaneDefinition` in `track/types.ts`). `buildTrack` makes it a
road only when asked (4f).

| Field                    | What                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `side`                   | Side of the track it lies on (every one so far: right)                                               |
| `fromPoint`, `toPoint`   | Main-loop control points it leaves after and rejoins before (`fromPoint` > `toPoint`: over the line) |
| `points`                 | Its centreline between them, world x/z, the lane's width (and the road's height on Monaco v2)        |
| `limit.from`, `limit.to` | The speed-limited stretch, between the pit entry and exit lines: **metres along the lane**           |
| `speedLimit`             | m/s: the real 80 km/h (Monaco 60, `pitSpeedLimit` in `circuits.ts`) × the circuit's scale            |
| `boxes`                  | `MAX_PLAYERS` (8) boxes, metres along the lane, inside `limit`, in driving order                     |

Metres along the lane, from where it leaves the main loop (its polyline from `fromPoint` through
`points`), not lap fractions: Monaco's entry runs across the lap, so a lap fraction there would be
ambiguous.

### Method

1. **The real lane**: OSM's `pit_lane` ways of the circuit relation, joined and put in driving
   order (`realPitLane`, also the decorative lane's source in `scenery.ts`); each point located on
   the real circuit near the previous one (lap fraction, lateral offset, gap beyond the real
   asphalt: `locate.ts`, shared with the scenery).
2. **Along the lap** every point stays where the real one is: entry, lane and exit are where they
   really are.
3. **Across**, adapted to the wider game track: on the real asphalt it follows the real line over
   the game's width; fully beside the track (real gap ≥ 7 m: half the 12 m lane and a pit wall) it
   runs right behind the game's 1 m pit wall, keeping the real lane's shape beyond that; in between
   (entry and exit ramps) it blends smoothly. Where another stretch would then be too close (the
   lane's edge nearer than the pit wall + 0.5 m to its wall), it is squeezed back towards its own
   track, never past its pit wall: Monaco's, by the Piscine.
   **At the edge** (`pitLaneAtEdge` in `circuits.ts`: Monaco, owner's choice after trying it):
   instead of following the real line across the track, the entry and exit run right beside its
   edge, and join it 30 m along from the main loop's point, so the road turns into them gradually
   (Monaco's real entry leaves La Rascasse sideways, and its exit crossed the whole start
   straight). There the points landing on the same spot are thinned out (4 m apart), the lane's
   offsets smoothed along it (no step from the edge to behind the pit wall), then its points too
   wherever that keeps its room from the other stretches: its walls never fold back.
4. **Limit lines**: where the real lane is fully beside the track.
5. **Boxes**: spread evenly over the real pit buildings beside the lane (OSM, within 80 m, at least
   12 m long), else (a town circuit, or none mapped) over the limited stretch but 15% at each end.
6. **Width**: the real 12 m × scale, like the decorative lane.

Checks: the tool reports any lane point too close to another stretch (none now) and any of its
walls folding back (a turn tighter than its half-width: none now), and draws
`01_tools/openf1/preview/<id>-pitlane.png`: walls grey, lane blue, limit lines orange, boxes red,
where it leaves and rejoins green, the start line black. Tested in
`track/layouts/index.test.ts`: entry/exit points, limit and boxes in order, the lane clear of every
wall between its limit lines, no pit lane on the imaginary tracks.

### Results

| Circuit     | Lane  | Limited stretch (m along) | Limit (game) | Boxes along       | Notes                                                                                                                        |
| ----------- | ----- | ------------------------- | ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Monza       | 698 m | 124–568                   | 76 km/h      | the pit buildings | Over the line, along the main straight                                                                                       |
| Barcelona   | 945 m | 89–778                    | 81 km/h      | the pit buildings | Exit up the inside of turn 1; last box there                                                                                 |
| Monaco      | 381 m | 50–361                    | 68 km/h      | spread (town)     | From the inside of La Rascasse, between the start straight and the Piscine (squeezed), back just after the line; at the edge |
| Mexico City | 780 m | 135–573                   | 79 km/h      | spread            | From the Peraltada, along the main straight; OSM maps only the paddock                                                       |
| Monaco v2   | 402 m | 26–357                    | 68 km/h      | spread (town)     | Monaco's, with the road's heights                                                                                            |

The ramps cross the run-off and the wall where they leave and rejoin the track: the walls open
there (4f).

## Drivable (4f)

`buildTrack(def, { pitLane: true })` adds the pit lane as one more route of the track (after the
branches', `Track.pit` true), like a branch (01_docs/track.md#branches-forks-and-shortcuts) but:

- **Over the start line**: its route starts where the lane rejoins the track (`toPoint`), runs the
  main loop round to where it leaves (`fromPoint`), then the lane back to the start. Its
  `BranchSpan` carries that `start` and the main loop's length, so `routeProgress` wraps: progress
  on the lane goes forward over the line, and laps and sectors are timed there as on the track.
- **Its own walls**: no run-off, so its walls stand at its edges: the pit wall on the track's side
  (1 m beyond the track's own wall), the garages' on the other. The walls of every road are one
  outline, as with branches: the track's wall opens where the lane leaves and rejoins it.
- **The track stays the track**: on the main loop's asphalt the pit lane never wins
  (`locateOnTrack`), so where they meet the surface, timing and edge lines are the track's; the
  view doesn't draw the lane's asphalt where its centre is on the track either. No piece of the
  pit lane on the track.
- **No kerbs**; its width is the pit lane's (11–14 m: below the branches' minimum, checked apart).
- **Only the Grand Prix builds it**: the server's Grand Prix rooms
  (`new Room(definition, { pitLane: true })` in `GameServer`) and the client's `OnlineGame` in that
  mode. Free practice, Time trial and single player build the track as before (tested: the main
  loop's samples are the same either way).
- **The bot never takes it** (`buildBotPlan` picks a shortcut that isn't the pit lane).
- **The view**: drawn with the track like a branch (asphalt, edge lines, its walls in concrete,
  heights on Monaco v2); the decorative lane behind the wall is left out, and a pit building that
  would stand on the drivable lane too (one garage box at Monaco).
- **Tried in single player (dev only)**: F2 → Pit lane (Grand Prix) → "drivable (reloads)", or
  `?pitlane` in the URL; the page goes back to the start screen, choose the circuit again.

Checks (tests): on every real circuit no wall crosses the lane or the main loop, the lane has its
own walls (never folding back) and no kerbs, the track's own centreline always belongs to the track, cars on it are located on it with progress going forward, a car driven
from the track through the lane back onto it at 15 m/s touches no wall, and the Hard bot never
enters it. Measured (that drive): Monza 43 s in the lane at 15 m/s, Barcelona 66 s, Monaco 27 s,
Mexico City 50 s.

Not yet: the speed limit and the stop in the box (4g); until then the pit lane is a road, and
driving it repairs nothing.
