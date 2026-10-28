import {
  GRAND_PRIX,
  type CarId,
  type GrandPrixInfo,
  type LapState,
  type PlayerInfo,
  type RaceStanding,
} from '@altf1/shared';
import { defaultLapName, formatDelta, formatLapTime } from '../view/hud/format';
import type { GrandPrixContent, GrandPrixRow } from '../view/hud/GrandPrixPanel';
import { LIVERIES, playerLivery } from '../view/pixelTexture';

/**
 * The Grand Prix panel for player `ownId`, by phase: the drivers (arrival order in the lobby, then
 * the qualifying order, which becomes the starting grid, then the race order with the gaps) and
 * what this player can do or is waiting for. The manager's keys: Enter (start, end qualifying,
 * end the race), 1/2/3 (race laps).
 */
export function grandPrixContent(
  info: GrandPrixInfo,
  players: readonly PlayerInfo[],
  ownId: CarId,
): GrandPrixContent {
  const byId = new Map(players.map((p) => [p.id, p]));
  const row = (id: CarId, name: string, note: string): GrandPrixRow[] => {
    const player = byId.get(id);
    if (!player) return [];
    return [{ name, color: playerLivery(player.livery).body, note, own: id === ownId }];
  };
  const isManager = info.manager === ownId;
  const manager = byId.get(info.manager)?.nickname ?? 'the manager';
  const time = (best: number | null): string => (best === null ? 'no time' : formatLapTime(best));

  switch (info.phase) {
    case 'lobby':
      return {
        title: 'GRAND PRIX · WAITING',
        rows: players.flatMap((p) => row(p.id, p.nickname, p.id === info.manager ? 'manager' : '')),
        hint: isManager
          ? 'You are the GP manager — Enter: start the GP'
          : `Waiting for ${manager} to start the GP`,
      };
    case 'qualifying': {
      const own = info.qualifying.find((entry) => entry.id === ownId);
      const done = own?.done ? 'Your laps are done — watching the others' : '';
      return {
        title: 'GRAND PRIX · QUALIFYING',
        rows: info.qualifying.flatMap((entry, i) => {
          const lap = entry.done ? 'done' : `Q${entry.laps + 1}`;
          const nickname = byId.get(entry.id)?.nickname ?? '';
          return row(entry.id, `${i + 1}  ${nickname}`, `${time(entry.best)} · ${lap}`);
        }),
        hint: isManager
          ? [done, 'Enter: end qualifying now'].filter(Boolean).join(' — ')
          : done || 'Three timed laps, Q1 to Q3: the best one counts',
      };
    }
    case 'grid': {
      const choices = GRAND_PRIX.raceLaps.map((laps, i) => `${i + 1}: ${laps} laps`).join(' · ');
      return {
        title: 'GRAND PRIX · STARTING GRID',
        rows: info.qualifying.flatMap((entry, i) =>
          row(entry.id, `P${i + 1}  ${byId.get(entry.id)?.nickname ?? ''}`, time(entry.best)),
        ),
        hint: isManager
          ? `Start the race — ${choices}`
          : `Waiting for ${manager} to start the race`,
      };
    }
    case 'race':
    case 'results': {
      const own = info.race.find((standing) => standing.id === ownId);
      const done = own?.status === 'finished' ? 'Finished — watching the others' : '';
      // A driver who left is no longer in `players`: drawn grey, by the name the server kept.
      const rows = info.race.map((standing, i) => {
        const player = byId.get(standing.id);
        return {
          name: `${i + 1}  ${standing.name}`,
          color: (player ? playerLivery(player.livery) : LIVERIES.grey).body,
          note: raceNote(standing, i, info.raceLaps!),
          own: standing.id === ownId,
        };
      });
      if (info.phase === 'results') return { title: 'GRAND PRIX · RESULTS', rows, hint: '' };
      return {
        title: `GRAND PRIX · RACE · ${info.raceLaps} LAPS`,
        rows,
        hint: isManager ? [done, 'Enter: end the race now'].filter(Boolean).join(' — ') : done,
      };
    }
  }
}

/**
 * A race line's note: DNF; the leader's lap (or race time once finished); the others' gap to the
 * leader, or the laps they are down.
 */
function raceNote(standing: RaceStanding, position: number, raceLaps: number): string {
  if (standing.status === 'dnf') return 'DNF';
  if (position === 0) {
    return standing.time !== null
      ? formatLapTime(standing.time)
      : `LAP ${Math.min(standing.laps + 1, raceLaps)}/${raceLaps}`;
  }
  if (standing.lapsBehind > 0) {
    return `+${standing.lapsBehind} LAP${standing.lapsBehind > 1 ? 'S' : ''}`;
  }
  return standing.gap === null ? '' : formatDelta(standing.gap);
}

/**
 * How the HUD names player `ownId`'s lap: Q1–Q3 in qualifying, position and lap in the race
 * (`P2/6 · LAP 3/8`, lap 1 from the grid on), else the usual `OUT LAP` / `LAP n`.
 */
export function lapName(info: GrandPrixInfo, ownId: CarId): (timing: LapState) => string {
  if (info.phase === 'qualifying') {
    return (timing) => (timing.lapStartTick === null ? 'OUT LAP' : `Q${timing.laps + 1}`);
  }
  if (info.phase === 'race') {
    const laps = info.raceLaps!;
    const position = info.race.findIndex((standing) => standing.id === ownId) + 1;
    return (timing) =>
      `P${position}/${info.race.length} · LAP ${Math.min(timing.laps + 1, laps)}/${laps}`;
  }
  return defaultLapName;
}
