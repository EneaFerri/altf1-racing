import { describe, expect, it } from 'vitest';
import { TEAMS } from '@altf1/shared';
import { PLAYER_LIVERIES, playerLivery, sponsorPixels, TEAM_LIVERIES } from './pixelTexture';

describe('playerLivery', () => {
  it('gives every one of the 8 players its own colour, then wraps around', () => {
    expect(new Set(PLAYER_LIVERIES.map((l) => l.body)).size).toBe(8);
    expect(playerLivery(0)).toBe(PLAYER_LIVERIES[0]);
    expect(playerLivery(7)).toBe(PLAYER_LIVERIES[7]);
    expect(playerLivery(8)).toBe(PLAYER_LIVERIES[0]);
    expect(playerLivery(-1)).toBe(PLAYER_LIVERIES[7]);
  });
});

describe('team liveries', () => {
  it('has one per team, each with its own colours', () => {
    expect(Object.keys(TEAM_LIVERIES).sort()).toEqual(TEAMS.map((t) => t.id).sort());
    const bodies = TEAMS.map((t) => TEAM_LIVERIES[t.id].body);
    expect(new Set(bodies).size).toBe(TEAMS.length);
  });

  it('draws the sponsor letters centred under the stripe, inside the texture', () => {
    const pixels = sponsorPixels('OF', 16, 10);
    // O: 12 lit pixels, F: 8; 7 px wide (two 3-px letters, one gap) from x = 4.
    expect(pixels).toHaveLength(20);
    expect(Math.min(...pixels.map(([x]) => x))).toBe(4);
    expect(Math.max(...pixels.map(([x]) => x))).toBe(10);
    expect(Math.max(...pixels.map(([, y]) => y))).toBe(14);
    expect(() => sponsorPixels('Z', 16, 10)).toThrow(/Z/);
  });
});
