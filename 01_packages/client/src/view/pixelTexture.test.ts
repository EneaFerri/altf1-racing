import { describe, expect, it } from 'vitest';
import { PLAYER_LIVERIES, playerLivery } from './pixelTexture';

describe('playerLivery', () => {
  it('gives every one of the 8 players its own colour, then wraps around', () => {
    expect(new Set(PLAYER_LIVERIES.map((l) => l.body)).size).toBe(8);
    expect(playerLivery(0)).toBe(PLAYER_LIVERIES[0]);
    expect(playerLivery(7)).toBe(PLAYER_LIVERIES[7]);
    expect(playerLivery(8)).toBe(PLAYER_LIVERIES[0]);
    expect(playerLivery(-1)).toBe(PLAYER_LIVERIES[7]);
  });
});
