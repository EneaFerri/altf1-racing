import type { CarId, GrandPrixInfo, PlayerInfo, RaceStanding } from '@altf1/shared';
import type { ListMenuItem } from '../view/menu/ListMenu';
import type { ClassificationRow, PodiumContent, ResultsChoice } from '../view/hud/ResultsScreen';
import { formatLapTime } from '../view/hud/format';
import { LIVERIES, playerLivery, type Livery } from '../view/pixelTexture';
import { raceNote } from './grandPrixText';

/** The finished race as the results screen shows it: frozen when the results come in. */
export interface RaceResult {
  readonly race: readonly RaceStanding[];
  readonly raceLaps: number;
  /** The players in the room then (a driver who left since is drawn grey). */
  readonly players: readonly PlayerInfo[];
}

/** The podium: the first three classified (DNFs never), each with their race time or gap. */
export function podiumContent({ race, raceLaps, players }: RaceResult): PodiumContent {
  const livery = liveryOf(players);
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

/**
 * The classification card for player `ownId`: every driver in race order, gap to the winner (the
 * winner's race time), fastest lap each and who holds the race's fastest one.
 */
export function classificationRows(
  { race, raceLaps, players }: RaceResult,
  ownId: CarId,
): ClassificationRow[] {
  const livery = liveryOf(players);
  const times = race.flatMap((standing) => (standing.best === null ? [] : [standing.best]));
  const fastest = times.length ? Math.min(...times) : null;
  return race.map((standing, i) => ({
    position: standing.status === 'dnf' ? '—' : String(i + 1),
    name: standing.name,
    color: livery(standing.id).body,
    gap: raceNote(standing, i, raceLaps),
    bestLap: standing.best === null ? '—' : formatLapTime(standing.best),
    fastest: standing.best !== null && standing.best === fastest,
    own: standing.id === ownId,
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

function liveryOf(players: readonly PlayerInfo[]): (id: CarId) => Livery {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (id) => {
    const player = byId.get(id);
    return player ? playerLivery(player.livery) : LIVERIES.grey;
  };
}
