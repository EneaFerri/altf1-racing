/**
 * The real circuits we build from open data, and how each is adapted to the game.
 * Data: https://openf1.org (2025 qualifying: times, sectors, speed) and OpenStreetMap
 * (© OpenStreetMap contributors, ODbL: road centreline). Pipeline and meaning of every field: README.md and
 * 01_docs/circuits.md. After changing a field, re-run `layout` (and `calibrate` if the lap time may
 * have moved: scale, widths, run-off).
 */

/** The real asphalt width at one point of the lap; eased to the next mark (see generate.ts). */
export interface WidthMark {
  /** Distance from the line along the profile's centreline (m, real scale). */
  readonly at: number;
  /** Real width (m). */
  readonly width: number;
  /** Where it is (real corner names). */
  readonly place: string;
  /** Published figure for this very spot; without it, an estimate within the published range. */
  readonly source?: string;
}

/** A grandstand placed by hand (temporary stands are not in OSM). Real metres. */
export interface HandStand {
  readonly name: string;
  /** Distance of its middle from the line along the profile's centreline. */
  readonly at: number;
  readonly length: number;
  readonly depth: number;
  /** Side of the track, seen driving. */
  readonly side: 'left' | 'right';
}

export interface CircuitConfig {
  /** File name of the data (`data/<id>.json`) and of the layout (`layouts/<id>.ts`). */
  readonly id: string;
  /** Exported constant of the generated TrackDefinition, and its display name. */
  readonly constName: string;
  readonly name: string;
  /** OpenF1 session key of the qualifying whose pole lap gives times, sectors and the lap's path. */
  readonly qualifying: number;
  /** OpenStreetMap relation (type=circuit) whose centreline gives the exact road shape. */
  readonly osmRelation: number;
  /** Published width range of the whole circuit (m), and where it comes from. */
  readonly widthRange: readonly [number, number];
  readonly widthSource: string;
  /** Real widths along the lap, sorted by `at`, each within `widthRange`. */
  readonly widths: readonly WidthMark[];

  // ---- Adaptation to the game ----
  /** Game width / real width, when not WIDTH_FACTOR (see there). */
  readonly widthFactor?: number;
  /** Uniform scale of the real circuit, calibrated so the Hard bot laps in the real pole time. */
  readonly scale: number;
  /** Direction of the start straight seen from above (degrees, 0 = right, 90 = up): as in the PNG. */
  readonly lineDirection: number;
  /** Distance from the asphalt edge to the wall (m, game scale). */
  readonly runoffWidth: number;
  readonly kerbs: 'corners' | 'everywhere';

  // ---- Scenery (scenery.ts) ----
  /**
   * A town circuit: every building around with its height, the sea, piers, pools, trees and the
   * tunnel, from OSM (Monaco). See 01_docs/themes.md.
   */
  readonly town?: boolean;
  /** Grandstands placed by hand where OSM has none. */
  readonly stands?: readonly HandStand[];
}

/**
 * Game width = real width × WIDTH_FACTOR, the same for the real circuits so their differences stay.
 * Not multiplied by `scale`: that only fits the lap time. A circuit may set its own `widthFactor`:
 * Monaco keeps the real car-to-road ratio so that overtaking stays as hard as in reality.
 */
export const WIDTH_FACTOR = 1.6;

/** A circuit's game width / real width. */
export function widthFactorOf(circuit: CircuitConfig): number {
  return circuit.widthFactor ?? WIDTH_FACTOR;
}

/**
 * Kerb band of every real circuit (m across the edge): 1.5× the default (TRACK_RULES), owner's
 * choice. Real circuits have only normal kerbs (a little less grip), never the high kerbs that kick
 * the car (owner's rule).
 */
export const KERB_BAND = { inset: 0.9, outset: 1.5 } as const;

const MONZANET = 'monzanet.it: 10–12 m';
const CATALUNYA = 'motogp.com (12 m), gedlich-racing.com (12–14 m)';
const ILLMAN = 'kymillman.com, "Why overtaking is nearly impossible at the Monaco Grand Prix"';

export const CIRCUITS: readonly CircuitConfig[] = [
  {
    id: 'monza',
    constName: 'MONZA',
    name: 'Monza',
    qualifying: 9908,
    osmRelation: 284565,
    widthRange: [10, 12],
    widthSource: MONZANET,
    widths: [
      { at: 0, width: 12, place: 'Rettifilo di partenza (start straight)' },
      { at: 790, width: 12, place: 'braking for the Variante del Rettifilo' },
      { at: 945, width: 10, place: 'Variante del Rettifilo' },
      { at: 1300, width: 11, place: 'Curva Biassono (Curva Grande)' },
      { at: 2120, width: 10, place: 'Variante della Roggia' },
      { at: 2530, width: 10, place: 'Lesmo 1' },
      { at: 2845, width: 10, place: 'Lesmo 2' },
      { at: 3300, width: 11, place: 'Curva del Serraglio' },
      { at: 3920, width: 10, place: 'Variante Ascari' },
      { at: 4500, width: 11, place: 'Rettifilo centrale (back straight)' },
      { at: 5150, width: 12, place: 'Curva Alboreto (Parabolica)' },
    ],
    scale: 0.948,
    lineDirection: 180,
    runoffWidth: 10,
    kerbs: 'corners',
  },
  {
    id: 'barcelona',
    constName: 'BARCELONA',
    name: 'Barcelona',
    qualifying: 9967,
    osmRelation: 284540,
    widthRange: [12, 14],
    widthSource: CATALUNYA,
    widths: [
      { at: 0, width: 14, place: 'main straight' },
      { at: 720, width: 14, place: 'braking for turn 1 (Elf)' },
      { at: 850, width: 13, place: 'turns 1–2' },
      { at: 1200, width: 12, place: 'turn 3 (Renault)' },
      { at: 1700, width: 12, place: 'turn 4 (Repsol)' },
      { at: 2100, width: 12, place: 'turn 5 (Seat)' },
      { at: 2500, width: 12, place: 'turns 7–8' },
      { at: 2850, width: 12, place: 'turn 9 (Campsa)' },
      { at: 3200, width: 13, place: 'back straight' },
      { at: 3450, width: 12, place: 'turn 10 (La Caixa)' },
      { at: 3740, width: 12, place: 'turn 12 (Banc Sabadell)' },
      { at: 4000, width: 12, place: 'turn 13' },
      { at: 4300, width: 12, place: 'turn 14 (New Holland)' },
    ],
    scale: 1.011,
    lineDirection: 180,
    runoffWidth: 10,
    kerbs: 'corners',
  },
  {
    id: 'monaco',
    constName: 'MONACO',
    name: 'Monaco',
    qualifying: 9975,
    osmRelation: 148194,
    widthRange: [8, 12],
    widthSource: ILLMAN,
    widths: [
      { at: 0, width: 12, place: 'start/finish straight', source: ILLMAN },
      { at: 170, width: 10, place: 'Sainte Dévote' },
      { at: 450, width: 10, place: 'Beau Rivage' },
      { at: 750, width: 9.5, place: 'Massenet' },
      { at: 860, width: 10, place: 'Casino' },
      { at: 1090, width: 9.45, place: 'Mirabeau Haute', source: ILLMAN },
      { at: 1200, width: 9, place: 'Grand Hotel hairpin' },
      { at: 1300, width: 9, place: 'Mirabeau Bas' },
      { at: 1370, width: 8.87, place: 'Portier', source: ILLMAN },
      { at: 1700, width: 10, place: 'tunnel' },
      { at: 2000, width: 9.3, place: 'Nouvelle Chicane (turn-in)', source: ILLMAN },
      { at: 2100, width: 10.12, place: 'Nouvelle Chicane (exit)', source: ILLMAN },
      { at: 2290, width: 9, place: 'Tabac' },
      { at: 2480, width: 12, place: 'Piscine entry (turns 13–14)' },
      { at: 2650, width: 9, place: 'Piscine exit (turns 15–16)' },
      { at: 2840, width: 8, place: 'La Rascasse (narrowest, published minimum)' },
      { at: 2950, width: 9, place: 'Anthony Noghes' },
      { at: 3150, width: 12, place: 'start/finish straight', source: ILLMAN },
    ],
    // Real car-to-road ratio (our car is 2.2 m wide, an F1 2 m): overtaking as hard as in reality.
    widthFactor: 1.2,
    scale: 1.133,
    lineDirection: 80,
    runoffWidth: 3,
    kerbs: 'corners',
    town: true,
    // The harbour is on the left from Tabac to La Rascasse.
    stands: [
      { name: 'Tribune B (Casino)', at: 870, length: 50, depth: 10, side: 'left' },
      { name: 'Tribune K (Tabac)', at: 2390, length: 120, depth: 14, side: 'left' },
      { name: 'Tribune T (Piscine, Rascasse)', at: 2770, length: 110, depth: 18, side: 'left' },
    ],
  },
];

export function circuitById(id: string): CircuitConfig {
  const circuit = CIRCUITS.find((c) => c.id === id);
  if (!circuit) throw new Error(`Unknown circuit "${id}": ${CIRCUITS.map((c) => c.id).join(', ')}`);
  return circuit;
}
