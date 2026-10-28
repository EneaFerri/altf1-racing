import { describe, expect, it } from 'vitest';
import type { PlayerInfo } from '@altf1/shared';
import { playerLivery } from '../view/pixelTexture';
import { grandPrixContent } from './grandPrixText';

const PLAYERS: PlayerInfo[] = [
  { id: 'p1', nickname: 'Enea', livery: 0 },
  { id: 'p2', nickname: 'Kimi', livery: 1 },
];

describe('Grand Prix panel', () => {
  it('lists the drivers with the manager marked and tells the manager how to start', () => {
    expect(grandPrixContent({ phase: 'lobby', manager: 'p1' }, PLAYERS, 'p1')).toEqual({
      title: 'GRAND PRIX · WAITING',
      rows: [
        { name: 'Enea', color: playerLivery(0).body, note: 'manager', own: true },
        { name: 'Kimi', color: playerLivery(1).body, note: '', own: false },
      ],
      hint: 'You are the GP manager — Enter: start the GP',
    });
  });

  it('tells the others who they are waiting for, and nothing once qualifying runs', () => {
    const lobby = grandPrixContent({ phase: 'lobby', manager: 'p1' }, PLAYERS, 'p2');
    expect(lobby.hint).toBe('Waiting for Enea to start the GP');
    const qualifying = grandPrixContent({ phase: 'qualifying', manager: 'p1' }, PLAYERS, 'p2');
    expect(qualifying).toMatchObject({ title: 'GRAND PRIX · QUALIFYING', hint: '' });
  });
});
