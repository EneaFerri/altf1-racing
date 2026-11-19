/** One team of the single-player Grand Prix: two drivers, in this order. */
export interface Team {
  readonly id: TeamId;
  readonly name: string;
  readonly drivers: readonly [string, string];
}

export type TeamId = 'mercedes' | 'ferrari' | 'redBull' | 'mclaren' | 'polimi';

/**
 * The single-player Grand Prix's teams, strongest first (owner, 2026-11-19: Mercedes > Ferrari >
 * Red Bull > McLaren > Polimi; Red Bull is the one with a Medium bot when the Hard seats run out).
 * Bot classes go by this order, then by driver order inside the team. Real line-ups (owner's
 * choice), Polimi the university's team. See 01_docs/bot.md#single-player-grand-prix.
 */
export const TEAMS: readonly Team[] = [
  { id: 'mercedes', name: 'Mercedes', drivers: ['Russell', 'Antonelli'] },
  { id: 'ferrari', name: 'Ferrari', drivers: ['Leclerc', 'Hamilton'] },
  { id: 'redBull', name: 'Red Bull', drivers: ['Verstappen', 'Hadjar'] },
  { id: 'mclaren', name: 'McLaren', drivers: ['Norris', 'Piastri'] },
  { id: 'polimi', name: 'Polimi', drivers: ['IngConti', 'Margara'] },
];

/** How many of the 9 bots drive at each level: the strongest seats get the Hard ones. */
export const BOT_CLASS_COUNTS = { hard: 5, medium: 4 } as const;
