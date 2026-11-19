import { GRAND_PRIX } from '../config/grandPrix';
import { TEAMS, type TeamId } from '../config/teams';
import type { CarId } from '../sim/car';
import type { RaceStanding } from './standings';
import type { Seat } from './teams';

/**
 * Each driver's points from the final classification `race` (in order): F1's 25, 18, 15, 12, 10,
 * 8, 6, 4, 2, 1 to the first ten classified, 0 below and to a DNF (single player's Grand Prix, S.6).
 */
export function racePoints(race: readonly RaceStanding[]): Record<CarId, number> {
  return Object.fromEntries(
    race.map((standing, i) => [
      standing.id,
      standing.status === 'dnf' ? 0 : (GRAND_PRIX.points[i] ?? 0),
    ]),
  );
}

/** A team in the constructors' standings of one race. */
export interface ConstructorStanding {
  readonly team: TeamId;
  readonly points: number;
  /** Its two drivers with their points, best placed first. */
  readonly drivers: readonly {
    readonly id: CarId;
    readonly name: string;
    readonly points: number;
  }[];
}

/**
 * The constructors' standings of one race: each team the sum of its two drivers' `points`, most
 * first; a tie goes to the team with the better placed driver in `race`. Pure.
 */
export function constructorStandings(
  race: readonly RaceStanding[],
  points: Readonly<Record<CarId, number>>,
  seats: readonly Seat[],
): ConstructorStanding[] {
  const place = (id: CarId): number => {
    const i = race.findIndex((s) => s.id === id);
    return i < 0 ? race.length : i;
  };
  return TEAMS.map((team) => {
    const drivers = seats
      .filter((seat) => seat.team === team.id)
      .map((seat) => ({ id: seat.id, name: seat.name, points: points[seat.id] ?? 0 }))
      .sort((a, b) => place(a.id) - place(b.id));
    return { team: team.id, points: drivers.reduce((sum, d) => sum + d.points, 0), drivers };
  }).sort((a, b) => b.points - a.points || place(a.drivers[0]!.id) - place(b.drivers[0]!.id));
}
