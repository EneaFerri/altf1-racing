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

/**
 * A corner made sharper than the real one (owner's choice: one you must brake for). Our car turns
 * far tighter than an F1, so a real 90° corner with a round apex is nearly flat out on its wide
 * line. Rebuilt as its two legs, straight on from `span` m either side of the apex, joined by the
 * tightest arc the walls allow (see generate.ts).
 */
export interface SharpCorner {
  /** Distance of its apex from the line along the profile's centreline (m, real scale). */
  readonly at: number;
  readonly place: string;
  /** How far either side of the apex the corner starts and ends (m, real scale). */
  readonly span: number;
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

/** A landmark drawn with its own model: the OSM building of that name, or holding a POI of it. */
export interface Landmark {
  readonly name: string;
  readonly kind: 'casino' | 'chapel';
}

/**
 * A stadium beside or around the track, drawn as a bowl of stands facing its field: along the
 * outline of its own OSM grandstands when it has three or more (they face the field, not the
 * track), else along its OSM outline.
 */
export interface Stadium {
  readonly name: string;
  /** Its OSM way: names change (Foro Sol is now Estadio GNP Seguros), ids don't. */
  readonly osmWay: number;
}

/** The town or park around a circuit that isn't a town circuit (Mexico City's sports park). */
export interface Surroundings {
  /** Buildings within this of the centreline are drawn, with their OSM heights (m, real). */
  readonly reach: number;
  /** OSM names of the buildings drawn with a dome (Palacio de los Deportes). */
  readonly domes: readonly string[];
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
  /** Corners made sharper than the real ones, sorted by `at`. */
  readonly sharpCorners?: readonly SharpCorner[];

  // ---- Scenery (scenery.ts) ----
  /**
   * A town circuit: every building around with its height, the sea, piers, pools, trees and the
   * tunnel, from OSM (Monaco). See 01_docs/themes.md.
   */
  readonly town?: boolean;
  /** Grandstands placed by hand where OSM has none. */
  readonly stands?: readonly HandStand[];
  /** Town circuits: buildings drawn with their own model. */
  readonly landmarks?: readonly Landmark[];
  /** Stadiums beside or around the track (Mexico City's Foro Sol and ballpark). */
  readonly stadiums?: readonly Stadium[];
  /** Grandstands further than this beyond the real asphalt are left out (m, real; default 250). */
  readonly standReach?: number;
  /** OSM "grandstands" that aren't (by name). */
  readonly notStands?: readonly string[];
  /** Buildings, lakes and domes around a park circuit, and the volcanoes' bearing. */
  readonly surroundings?: Surroundings;
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
/**
 * No published width for Mexico: measured on OSM's asphalt areas (`area:highway=raceway`, traced
 * from aerial imagery) across the centreline, the median of each stretch (01_docs/circuits.md).
 */
const OSM_AREAS = 'OSM area:highway=raceway, measured across the centreline';
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
    landmarks: [
      { name: 'Casino de Monte Carlo', kind: 'casino' },
      { name: 'Chapelle Sainte-Dévote', kind: 'chapel' },
    ],
  },
  {
    id: 'mexico',
    constName: 'MEXICO',
    name: 'Mexico City',
    qualifying: 9873,
    osmRelation: 16251935,
    widthRange: [10.8, 15],
    widthSource: OSM_AREAS,
    widths: [
      { at: 0, width: 14.7, place: 'main straight (start line)', source: OSM_AREAS },
      { at: 300, width: 15, place: 'main straight (pit exit)', source: OSM_AREAS },
      { at: 600, width: 12.6, place: 'main straight', source: OSM_AREAS },
      { at: 900, width: 11.5, place: 'braking for turn 1', source: OSM_AREAS },
      { at: 1300, width: 11.3, place: 'turns 1–3', source: OSM_AREAS },
      { at: 1600, width: 10.8, place: 'straight to turn 4 (narrowest)', source: OSM_AREAS },
      { at: 2100, width: 12.1, place: 'turns 4–5', source: OSM_AREAS },
      { at: 2300, width: 11.5, place: 'turn 6', source: OSM_AREAS },
      { at: 2600, width: 11.6, place: 'esses, turns 7–8', source: OSM_AREAS },
      { at: 2900, width: 12.2, place: 'esses, turns 9–11', source: OSM_AREAS },
      { at: 3300, width: 12.4, place: 'straight to the stadium', source: OSM_AREAS },
      { at: 3600, width: 11.1, place: 'turn 12 (Foro Sol entry)', source: OSM_AREAS },
      { at: 3850, width: 11.7, place: 'Foro Sol, turns 13–15', source: OSM_AREAS },
      { at: 4000, width: 14.6, place: 'turns 16–17 (Peraltada exit)', source: OSM_AREAS },
      { at: 4200, width: 14.7, place: 'main straight', source: OSM_AREAS },
    ],
    // Owner's choice: real widths × 1.4, not WIDTH_FACTOR's 1.6.
    widthFactor: 1.4,
    scale: 0.9858,
    lineDirection: 20,
    // 10 m (Monza, Barcelona) leaves the walls no room in the tight corners (real radii 14–20 m:
    // turns 4–6, the stadium), and the sharp corners' arcs are as tight as it lets them be.
    runoffWidth: 4,
    kerbs: 'corners',
    // Owner's choice: the 90° corners made sharp, so that you must brake for them.
    sharpCorners: [
      { at: 1185, span: 30, place: 'turn 1' },
      { at: 2020, span: 28, place: 'turn 4' },
      { at: 2092, span: 30, place: 'turn 5' },
      { at: 2235, span: 40, place: 'turn 6' },
      { at: 3618, span: 25, place: 'turn 12 (into the stadium)' },
      { at: 3795, span: 28, place: 'turn 13 (Foro Sol)' },
      { at: 3982, span: 28, place: 'turn 16' },
    ],
    // Turns 12–16 run through the Foro Sol, in front of its stands; the ballpark stands in the infield.
    stadiums: [
      { name: 'Foro Sol', osmWay: 1315412542 },
      { name: 'Estadio Alfredo Harp Helú', osmWay: 827822088 },
    ],
    // OSM's other grandstands are the sports park's (pitches), up to 200 m away.
    standReach: 60,
    notStands: ['Gimnasio Constancio Córdoba Álvarez'],
    // The GP's temporary grandstands, on the outside of the corners (the pits are on the right).
    stands: [
      { name: 'Grada Curva 1', at: 1090, length: 140, depth: 16, side: 'left' },
      { name: 'Grada Curva 3', at: 1350, length: 70, depth: 14, side: 'left' },
      { name: 'Grada Curva 4', at: 1985, length: 80, depth: 14, side: 'right' },
      { name: 'Grada Curvas 5–6', at: 2170, length: 70, depth: 14, side: 'left' },
      { name: 'Grada Eses', at: 2700, length: 160, depth: 14, side: 'left' },
      { name: 'Grada Curva 12', at: 3560, length: 80, depth: 14, side: 'left' },
      { name: 'Grada Peraltada', at: 4120, length: 120, depth: 16, side: 'left' },
    ],
    surroundings: { reach: 500, domes: ['Palacio de los Deportes', 'Velódromo CNAR'] },
  },
];

export function circuitById(id: string): CircuitConfig {
  const circuit = CIRCUITS.find((c) => c.id === id);
  if (!circuit) throw new Error(`Unknown circuit "${id}": ${CIRCUITS.map((c) => c.id).join(', ')}`);
  return circuit;
}
