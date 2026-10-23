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

/** One OpenStreetMap feature around a circuit, as scenery.ts keeps it. */
export interface SceneryFeature {
  readonly kind: 'grandstand' | 'building' | 'pitLane' | 'wood' | 'raceway';
  readonly name: string;
  /** [lat, lon]; closed polygons repeat their first point. */
  readonly points: readonly (readonly [number, number])[];
}

/** What scenery.ts downloads (`data/<id>.scenery.json`). */
export interface RawScenery {
  readonly attribution: string;
  readonly bbox: string;
  readonly features: readonly SceneryFeature[];
}

/**
 * Where OpenStreetMap coordinates land in the profile's frame: [lat, lon] → metres (equirectangular
 * around `lat0`), then rotated by `angle` and shifted by (tx, ty). Found by registering the OSM
 * centreline onto the OpenF1 lap (profile.ts); used for every other OSM feature (scenery.ts).
 */
export interface OsmFrame {
  readonly lat0: number;
  readonly angle: number;
  readonly tx: number;
  readonly ty: number;
}

/** [lat, lon] → metres around `lat0`, before registration. */
export function osmMetres(lat0: number): (p: readonly [number, number]) => [number, number] {
  return ([lat, lon]) => [lon * 111320 * Math.cos((lat0 * Math.PI) / 180), lat * 110574];
}

/** [lat, lon] → the profile's frame (m, y north). */
export function osmToProfile(frame: OsmFrame): (p: readonly [number, number]) => [number, number] {
  const metres = osmMetres(frame.lat0);
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  return (p) => {
    const [x, y] = metres(p);
    return [x * cos - y * sin + frame.tx, x * sin + y * cos + frame.ty];
  };
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
  /** How OSM coordinates map into this profile's frame. */
  readonly osmFrame: OsmFrame;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export const rawPath = (id: string): string => join(HERE, 'data', `${id}.openf1.json`);
export const osmPath = (id: string): string => join(HERE, 'data', `${id}.osm.json`);
export const sceneryPath = (id: string): string => join(HERE, 'data', `${id}.scenery.json`);
export const profilePath = (id: string): string => join(HERE, 'data', `${id}.json`);
export const layoutPath = (id: string): string =>
  join(HERE, '../../01_packages/shared/src/track/layouts', `${id}.ts`);

export const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
