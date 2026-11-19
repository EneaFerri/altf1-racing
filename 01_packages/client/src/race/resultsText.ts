import {
  requiredStops,
  TEAMS,
  TICK_RATE,
  type ConstructorStanding,
  type TeamId,
  type CarId,
  type GrandPrixInfo,
  type RaceStanding,
} from '@altf1/shared';
import type { ListMenuItem } from '../view/menu/ListMenu';
import type {
  ClassificationRow,
  ConstructorRow,
  PodiumContent,
  ResultsChoice,
} from '../view/hud/ResultsScreen';
import { formatLapTime } from '../view/hud/format';
import { LIVERIES, TEAM_LIVERIES, type Livery } from '../view/pixelTexture';
import { raceNote, type DriverLook } from './grandPrixText';

/** The finished race as the results screen shows it: frozen when the results come in. */
export interface RaceResult {
  readonly race: readonly RaceStanding[];
  readonly raceLaps: number;
  /** How the drivers are shown (a driver who left since, not in it, is drawn grey). */
  readonly drivers: readonly DriverLook[];
}

/** The podium: the first three classified (DNFs never), each with their race time or gap. */
export function podiumContent({ race, raceLaps, drivers }: RaceResult): PodiumContent {
  const livery = liveryOf(drivers);
  return {
    title: 'GRAND PRIX · PODIUM',
    places: race.slice(0, 3).flatMap((standing, i) =>
      standing.status === 'dnf'
        ? []
        : [
            {
              name: standing.name,
              livery: livery(standing.id),
              note: raceNote(standing, i, raceLaps),
            },
          ],
    ),
  };
}

/** Single player's Grand Prix (S.6): each driver's team and points, for the card's extra columns. */
export interface Scoring {
  readonly points: Readonly<Record<CarId, number>>;
  readonly teamOf: (id: CarId) => string;
}

/**
 * The classification card for player `ownId`: every driver in race order, gap to the winner (the
 * winner's race time, the pit penalties included), fastest lap each and who holds the race's
 * fastest one, stops made / required on the laps each completed and the penalty for any missing;
 * with `scoring`, each one's team and points too.
 */
export function classificationRows(
  { race, raceLaps, drivers }: RaceResult,
  ownId: CarId,
  scoring?: Scoring,
): ClassificationRow[] {
  const livery = liveryOf(drivers);
  const times = race.flatMap((standing) => (standing.best === null ? [] : [standing.best]));
  const fastest = times.length ? Math.min(...times) : null;
  return race.map((standing, i) => {
    const required = requiredStops(standing.laps);
    return {
      position: standing.status === 'dnf' ? '—' : String(i + 1),
      name: standing.name,
      color: livery(standing.id).body,
      gap: raceNote(standing, i, raceLaps),
      bestLap: standing.best === null ? '—' : formatLapTime(standing.best),
      stops: required > 0 ? `${standing.stops}/${required}` : String(standing.stops),
      stopsShort: standing.status !== 'dnf' && standing.stops < required,
      penalty: standing.penalty > 0 ? `+${standing.penalty / TICK_RATE} s` : '',
      fastest: standing.best !== null && standing.best === fastest,
      own: standing.id === ownId,
      ...(scoring && {
        team: scoring.teamOf(standing.id),
        points: String(scoring.points[standing.id] ?? 0),
      }),
    };
  });
}

/**
 * The constructors' card of one race (single player's Grand Prix, S.6): each team in order, in its
 * colour, its drivers with their points and its total; `ownTeam` (the player's) highlighted.
 */
export function constructorRows(
  standings: readonly ConstructorStanding[],
  ownTeam: TeamId,
): ConstructorRow[] {
  return standings.map((standing, i) => ({
    position: String(i + 1),
    name: TEAMS.find((team) => team.id === standing.team)!.name,
    color: TEAM_LIVERIES[standing.team].body,
    drivers: standing.drivers.map((d) => `${d.name} ${d.points}`).join(' · '),
    points: String(standing.points),
    own: standing.team === ownTeam,
  }));
}

/**
 * The card's Play again row, by where the circuit's Grand Prix is now: still on the results (opens
 * a new lobby), in a new lobby (joins it), or already running again (only Exit is left).
 */
export function playAgainItem(info: GrandPrixInfo): ListMenuItem<ResultsChoice> {
  const item = { name: 'Play again', value: 'playAgain' as const };
  if (info.phase === 'results') return { ...item, detail: 'Opens a new lobby here' };
  if (info.phase === 'lobby') {
    return { ...item, detail: `Join the new lobby · ${info.drivers.length} in` };
  }
  return { ...item, detail: 'The new GP has started', disabled: true };
}

function liveryOf(drivers: readonly DriverLook[]): (id: CarId) => Livery {
  const byId = new Map(drivers.map((d) => [d.id, d.livery]));
  return (id) => byId.get(id) ?? LIVERIES.grey;
}
