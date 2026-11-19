import { describe, expect, it } from 'vitest';
import { TEAMS, type TeamId } from '../config/teams';
import { PLAYER_SEAT_ID, squadBots, teamBoxes, teamLineup } from './teams';

const kinds = (team: TeamId, random: number) =>
  teamLineup(team, () => random).map((seat) => `${seat.name}:${seat.kind}`);

describe('single-player Grand Prix lineup', () => {
  it('always has the player and 5 Hard and 4 Medium bots, two cars per team', () => {
    for (const { id } of TEAMS) {
      for (const random of [0, 0.99]) {
        const seats = teamLineup(id, () => random);
        expect(seats).toHaveLength(10);
        expect(seats.filter((s) => s.kind === 'player')).toHaveLength(1);
        expect(seats.filter((s) => s.kind === 'hard')).toHaveLength(5);
        expect(seats.filter((s) => s.kind === 'medium')).toHaveLength(4);
        for (const team of TEAMS) {
          expect(seats.filter((s) => s.team === team.id)).toHaveLength(2);
        }
        expect(new Set(seats.map((s) => s.id)).size).toBe(10);
      }
    }
  });

  it('replaces a random driver of the chosen team, the teammate stays', () => {
    const first = teamLineup('ferrari', () => 0, 'Enea').filter((s) => s.team === 'ferrari');
    expect(first.map((s) => [s.id, s.name])).toEqual([
      [PLAYER_SEAT_ID, 'Enea'],
      ['ferrari-1', 'Hamilton'],
    ]);
    const second = teamLineup('ferrari', () => 0.7).filter((s) => s.team === 'ferrari');
    expect(second.map((s) => s.name)).toEqual(['Leclerc', 'You']);
  });

  it('gives the Hard seats to the strongest teams: Red Bull split when the player is behind it', () => {
    expect(kinds('mclaren', 0)).toEqual([
      'Russell:hard',
      'Antonelli:hard',
      'Leclerc:hard',
      'Hamilton:hard',
      'Verstappen:hard',
      'Hadjar:medium',
      'You:player',
      'Piastri:medium',
      'IngConti:medium',
      'Margara:medium',
    ]);
    expect(kinds('mercedes', 0)).toEqual([
      'You:player',
      'Antonelli:hard',
      'Leclerc:hard',
      'Hamilton:hard',
      'Verstappen:hard',
      'Hadjar:hard',
      'Norris:medium',
      'Piastri:medium',
      'IngConti:medium',
      'Margara:medium',
    ]);
  });

  it('gives each team a box, the player one of their own; the second bot of a box pits a lap later', () => {
    const seats = teamLineup('ferrari', () => 0);
    expect(teamBoxes(seats)).toMatchObject({
      'mercedes-0': 0,
      'mercedes-1': 0,
      player: 5,
      'ferrari-1': 1,
      'polimi-1': 4,
    });
    const bots = squadBots(seats);
    expect(bots).toHaveLength(9);
    expect(bots.find((b) => b.id === 'mercedes-1')).toMatchObject({ box: 0, pitLag: 1 });
    expect(bots.find((b) => b.id === 'ferrari-1')).toMatchObject({ box: 1, pitLag: 0 });
  });
});
