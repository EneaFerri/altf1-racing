/**
 * Downloads a circuit's data, saved in `data/` (committed, a few tens of KB) so the profile can be
 * rebuilt offline:
 * - `<id>.openf1.json`: the pole lap of the qualifying from the OpenF1 API (lap and sector times,
 *   the car's positions and speed over the lap);
 * - `<id>.osm.json`: the circuit's road centreline from OpenStreetMap (Overpass API).
 * Usage: node 01_tools/openf1/fetch.ts <id>
 */
import { writeFileSync } from 'node:fs';
import { circuitById } from './circuits.ts';
import { osmPath, rawPath, type RawLap, type RawOsmCircuit, type RawPoleLap } from './openf1.ts';

const API = 'https://api.openf1.org/v1';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
/** Relation members that are not the racing line. */
const NOT_THE_TRACK = new Set(['pit_lane', 'penalty']);
/** Extra data either side of the lap, so its ends can be interpolated (ms). */
const MARGIN = 2000;

async function get<T>(query: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}/${query}`);
    if (response.ok) return (await response.json()) as T;
    if (response.status !== 429 || attempt >= 5) {
      throw new Error(`${query}: HTTP ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
}

const circuit = circuitById(process.argv[2] ?? '');
const session = circuit.qualifying;
const laps = await get<RawLap[]>(`laps?session_key=${session}`);
const lap = laps
  .filter((l) => l.date_start && l.lap_duration)
  .sort((a, b) => a.lap_duration! - b.lap_duration!)[0]!;
const start = Date.parse(lap.date_start!);
const window = (from: number, to: number): string =>
  `session_key=${session}&driver_number=${lap.driver_number}` +
  `&date>=${new Date(from).toISOString()}&date<=${new Date(to).toISOString()}`;
const range = window(start - MARGIN, start + lap.lap_duration! * 1000 + MARGIN);

const location = await get<{ date: string; x: number; y: number }[]>(`location?${range}`);
const speed = await get<{ date: string; speed: number }[]>(`car_data?${range}`);
const raw: RawPoleLap = {
  session,
  lap,
  location: location.map((p) => [Date.parse(p.date), p.x, p.y]),
  speed: speed.map((s) => [Date.parse(s.date), s.speed]),
};
writeFileSync(rawPath(circuit.id), JSON.stringify(raw) + '\n');
console.log(
  `${circuit.name}: pole ${lap.lap_duration} s by #${lap.driver_number} (lap ${lap.lap_number}), ` +
    `${raw.location.length} positions, ${raw.speed.length} speeds`,
);

interface OverpassRelation {
  readonly tags: Record<string, string>;
  readonly members: readonly {
    readonly type: string;
    readonly role: string;
    readonly geometry?: readonly { readonly lat: number; readonly lon: number }[];
  }[];
}
const query = `[out:json][timeout:60];relation(${circuit.osmRelation});out geom;`;
const response = await fetch(OVERPASS, {
  method: 'POST',
  // Overpass refuses requests without a user agent.
  headers: {
    'User-Agent': 'AltF1-Racing track tool',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: `data=${encodeURIComponent(query)}`,
});
if (!response.ok) throw new Error(`Overpass: HTTP ${response.status}`);
const relation = ((await response.json()) as { elements: OverpassRelation[] }).elements[0]!;
const osm: RawOsmCircuit = {
  relation: circuit.osmRelation,
  name: relation.tags.name ?? circuit.name,
  attribution: '© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)',
  ways: relation.members
    .filter((m) => m.type === 'way' && m.geometry && !NOT_THE_TRACK.has(m.role))
    .map((m) => m.geometry!.map((p): [number, number] => [p.lat, p.lon])),
};
writeFileSync(osmPath(circuit.id), JSON.stringify(osm) + '\n');
console.log(`  OpenStreetMap: "${osm.name}", ${osm.ways.length} ways`);
