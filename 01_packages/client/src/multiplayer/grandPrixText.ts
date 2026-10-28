import { GRAND_PRIX, type CarId, type GrandPrixInfo, type PlayerInfo } from '@altf1/shared';
import { formatLapTime } from '../view/hud/format';
import type { GrandPrixContent, GrandPrixRow } from '../view/hud/GrandPrixPanel';
import { playerLivery } from '../view/pixelTexture';

/**
 * The Grand Prix panel for player `ownId`, by phase: the drivers (arrival order in the lobby, then
 * the qualifying order, which becomes the starting grid) and what this player can do or is waiting
 * for. The manager's keys: Enter (start, end qualifying), 1/2/3 (race laps).
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
    case 'grid':
    case 'race': {
      const choices = GRAND_PRIX.raceLaps.map((laps, i) => `${i + 1}: ${laps} laps`).join(' · ');
      return {
        title:
          info.phase === 'grid'
            ? 'GRAND PRIX · STARTING GRID'
            : `GRAND PRIX · RACE · ${info.raceLaps} LAPS`,
        rows: info.qualifying.flatMap((entry, i) =>
          row(entry.id, `P${i + 1}  ${byId.get(entry.id)?.nickname ?? ''}`, time(entry.best)),
        ),
        hint:
          info.phase === 'race'
            ? ''
            : isManager
              ? `Start the race — ${choices}`
              : `Waiting for ${manager} to start the race`,
      };
    }
  }
}

/** How the HUD names the lap being driven: Q1–Q3 in qualifying, else the usual `LAP n`. */
export function lapName(info: GrandPrixInfo | null): (laps: number) => string {
  return info?.phase === 'qualifying' ? (laps) => `Q${laps + 1}` : (laps) => `LAP ${laps + 1}`;
}
