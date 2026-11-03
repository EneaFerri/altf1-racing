# Real-circuit tool (OpenF1 + OpenStreetMap)

Builds the game layouts of real circuits from open data. Method, sources and results:
[01_docs/circuits.md](../../01_docs/circuits.md). Plain Node (≥ 23.6, strips the TypeScript
types), no build step; run from the repo root, `<id>` = `monza`, `barcelona`, `monaco` or `mexico`.

```
node 01_tools/openf1/fetch.ts <id> [--no-osm]  # download: OpenF1 pole lap (with z) + OSM centreline → data/
node 01_tools/openf1/profile.ts <id>     # data/<id>.json: centreline, speed, corners, sectors
node --import ./01_tools/resolveTs.ts 01_tools/openf1/layout.ts <id>     # layout + preview
node --import ./01_tools/resolveTs.ts 01_tools/openf1/calibrate.ts <id> [scale]
node --import ./01_tools/resolveTs.ts 01_tools/openf1/scenery.ts <id> [--fetch]  # OSM scenery
node --import ./01_tools/resolveTs.ts 01_tools/openf1/terrain.ts <id> [--fetch]  # land (EU-DEM), elevation report, Monaco v2's land grid
```

`layout`, `calibrate` and `scenery` use the game's own code in `01_packages/shared`, whose imports have no
extension: `01_tools/resolveTs.ts` (shared with the multiplayer server) lets Node resolve them.

| File           | Role                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| `circuits.ts`  | Every circuit: sources, real widths, adaptation (scale, width factor, run-off)         |
| `fetch.ts`     | Downloads `data/<id>.openf1.json` and `data/<id>.osm.json` (committed)                 |
| `profile.ts`   | Turns them into `data/<id>.json` (committed), incl. `osmFrame` (OSM → frame)           |
| `generate.ts`  | Profile + adaptation → `TrackDefinition` (used by layout and calibrate)                |
| `layout.ts`    | Writes `01_packages/shared/src/track/layouts/<id>.ts` and `preview/<id>.png`           |
| `calibrate.ts` | Finds the scale at which the Hard bot laps in the real pole time                       |
| `scenery.ts`   | OSM scenery (+ town layers, stadium) → `data/<id>.scenery.json` → `<id>Layout.ts`      |
| `terrain.ts`   | EU-DEM land heights → `data/<id>.terrain.json`; elevation report and preview (Phase 3) |
| `elevation.ts` | `landHeight`, `profileToOsm`, `alignHeights`: the track's heights onto the land        |
| `openf1.ts`    | Data shapes and paths · `geometry.ts` polyline helpers · `png.ts` previews             |
