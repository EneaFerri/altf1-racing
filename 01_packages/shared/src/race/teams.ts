import type { SquadBot } from '../ai/squad';
import type { BotLevel } from '../config/bot';
import { BOT_CLASS_COUNTS, TEAMS, type TeamId } from '../config/teams';

/** One car of the single-player Grand Prix: the player, or a bot at its level. */
export interface Seat {
  /** Car id: `player`, or the bot's `<team>-<driver index>` (e.g. `ferrari-1`). */
  readonly id: string;
  readonly name: string;
  readonly team: TeamId;
  readonly kind: 'player' | BotLevel;
}

/** The player's car id in the single-player Grand Prix. */
export const PLAYER_SEAT_ID = 'player';

/**
 * The 10 cars of a single-player Grand Prix with the player in `playerTeam`: one of its two
 * drivers, drawn with `random` (0..1), gives their seat to the player (named `playerName`); the
 * teammate stays. The 9 bots, ranked by team strength (`TEAMS` order) then driver order, are Hard
 * for the first `BOT_CLASS_COUNTS.hard`, Medium for the rest. Seats in `TEAMS` order. Pure.
 */
export function teamLineup(playerTeam: TeamId, random: () => number, playerName = 'You'): Seat[] {
  const replaced = random() < 0.5 ? 0 : 1;
  let hardLeft: number = BOT_CLASS_COUNTS.hard;
  return TEAMS.flatMap((team) =>
    team.drivers.map((driver, i): Seat => {
      if (team.id === playerTeam && i === replaced) {
        return { id: PLAYER_SEAT_ID, name: playerName, team: team.id, kind: 'player' };
      }
      const kind: BotLevel = hardLeft-- > 0 ? 'hard' : 'medium';
      return { id: `${team.id}-${i}`, name: driver, team: team.id, kind };
    }),
  );
}

/**
 * Each car's pit box: one per team, in `TEAMS` order (teammates share it, as in F1), and the
 * player one of their own after them, so they never queue behind their teammate. Every circuit
 * has 8 boxes: 5 teams + the player's.
 */
export function teamBoxes(seats: readonly Seat[]): Record<string, number> {
  return Object.fromEntries(
    seats.map((seat) => [
      seat.id,
      seat.kind === 'player' ? TEAMS.length : TEAMS.findIndex((team) => team.id === seat.team),
    ]),
  );
}

/**
 * The bots of `seats` for `BotSquad`: their level and box, and for the second bot of a team
 * sharing its box a lap of `pitLag` (later, or earlier), so the two don't come in on the same lap.
 */
export function squadBots(seats: readonly Seat[]): SquadBot[] {
  const boxes = teamBoxes(seats);
  const seen = new Set<TeamId>();
  return seats.flatMap((seat) => {
    if (seat.kind === 'player') return [];
    const pitLag = seen.has(seat.team) ? 1 : 0;
    seen.add(seat.team);
    return [{ id: seat.id, level: seat.kind, box: boxes[seat.id]!, pitLag }];
  });
}
