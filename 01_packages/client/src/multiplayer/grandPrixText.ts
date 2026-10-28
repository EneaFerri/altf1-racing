import type { CarId, GrandPrixInfo, PlayerInfo } from '@altf1/shared';
import type { GrandPrixContent } from '../view/hud/GrandPrixPanel';
import { playerLivery } from '../view/pixelTexture';

/**
 * The Grand Prix panel for player `ownId`: the phase, everyone in the room in arrival order (the
 * manager marked) and what this player can do or is waiting for.
 */
export function grandPrixContent(
  info: GrandPrixInfo,
  players: readonly PlayerInfo[],
  ownId: CarId,
): GrandPrixContent {
  const rows = players.map((p) => ({
    name: p.nickname,
    color: playerLivery(p.livery).body,
    note: p.id === info.manager ? 'manager' : '',
    own: p.id === ownId,
  }));
  if (info.phase === 'qualifying') return { title: 'GRAND PRIX · QUALIFYING', rows, hint: '' };
  const manager = players.find((p) => p.id === info.manager)?.nickname ?? 'the manager';
  return {
    title: 'GRAND PRIX · WAITING',
    rows,
    hint:
      info.manager === ownId
        ? 'You are the GP manager — Enter: start the GP'
        : `Waiting for ${manager} to start the GP`,
  };
}
