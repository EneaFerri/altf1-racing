/** OpenF1 data shapes and file locations shared by the tool's scripts. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fields we use of an OpenF1 `laps` record. */
export interface RawLap {
  readonly driver_number: number;
  readonly lap_number: number;
  readonly date_start: string | null;
  readonly lap_duration: number | null;
  readonly duration_sector_1: number | null;
  readonly duration_sector_2: number | null;
  readonly duration_sector_3: number | null;
}

/** What fetch.ts saves (`data/<id>.openf1.json`): the pole lap and the car's data around it. */
export interface RawPoleLap {
  readonly session: number;
  readonly lap: RawLap;
  /** [epoch ms, x, y], x/y in decimetres (OpenF1 units). */
  readonly location: readonly (readonly [number, number, number])[];
  /** [epoch ms, km/h]. */
  readonly speed: readonly (readonly [number, number])[];
}

/** What fetch.ts saves from OpenStreetMap (`data/<id>.osm.json`): the circuit's road centreline. */
export interface RawOsmCircuit {
  readonly relation: number;
  readonly name: string;
  readonly attribution: string;
  /** The relation's ways except pit lane and penalty loops, each as [lat, lon] points. */
  readonly ways: readonly (readonly (readonly [number, number])[])[];
}

/** What profile.ts extracts (`data/<id>.json`, committed). Real metres. */
export interface CircuitProfile {
  readonly name: string;
  readonly source: { readonly session: number; readonly driver: number; readonly lap: number };
  /** Pole lap and sector times (s). */
  readonly pole: { readonly time: number; readonly sectors: readonly [number, number, number] };
  /** Centreline length (m). */
  readonly length: number;
  /** Distance from the line where sectors 2 and 3 start (m). */
  readonly sectorStarts: readonly [number, number];
  /** Distance between stations (m). */
  readonly spacing: number;
  /** Road centreline stations from the line in driving order: [x, y] (m, OpenF1 frame: y north). */
  readonly stations: readonly (readonly [number, number])[];
  /** Pole lap speed at each station (km/h). */
  readonly speed: readonly number[];
  /** Slowest points of the lap (corners): distance from the line (m) and speed (km/h). */
  readonly corners: readonly { readonly at: number; readonly speed: number }[];
}

const HERE = dirname(fileURLToPath(import.meta.url));

export const rawPath = (id: string): string => join(HERE, 'data', `${id}.openf1.json`);
export const osmPath = (id: string): string => join(HERE, 'data', `${id}.osm.json`);
export const profilePath = (id: string): string => join(HERE, 'data', `${id}.json`);
export const layoutPath = (id: string): string =>
  join(HERE, '../../01_packages/shared/src/track/layouts', `${id}.ts`);

export const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
