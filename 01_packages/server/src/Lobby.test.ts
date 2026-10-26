import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, PROTOCOL_VERSION } from '@altf1/shared';
import { Lobby } from './Lobby.ts';

const join = (lobby: Lobby, nickname: string) => lobby.join(PROTOCOL_VERSION, nickname);

describe('Lobby', () => {
  it('accepts a valid nickname, normalized, with a fresh id and the first livery', () => {
    const lobby = new Lobby();
    expect(join(lobby, '  Enea ')).toEqual({
      ok: true,
      player: { id: 'p1', nickname: 'Enea', livery: 0 },
    });
    expect(lobby.players()).toEqual([{ id: 'p1', nickname: 'Enea', livery: 0 }]);
  });

  it('keeps nicknames unique among players online, ignoring case and spaces', () => {
    const lobby = new Lobby();
    join(lobby, 'Enea');
    expect(join(lobby, 'ENEA')).toEqual({ ok: false, reason: 'taken' });
    expect(join(lobby, ' enea ')).toEqual({ ok: false, reason: 'taken' });
    expect(join(lobby, 'Enea2').ok).toBe(true);
  });

  it('frees a nickname as soon as its player leaves', () => {
    const lobby = new Lobby();
    join(lobby, 'Enea');
    lobby.leave('p1');
    expect(lobby.players()).toEqual([]);
    expect(join(lobby, 'enea')).toMatchObject({ ok: true, player: { nickname: 'enea' } });
  });

  it('rejects an invalid nickname, an old client and a full room', () => {
    const lobby = new Lobby();
    expect(join(lobby, 'x')).toEqual({ ok: false, reason: 'invalid' });
    expect(join(lobby, '<script>')).toEqual({ ok: false, reason: 'invalid' });
    expect(lobby.join(PROTOCOL_VERSION + 1, 'Enea')).toEqual({ ok: false, reason: 'version' });
    for (let i = 0; i < MAX_PLAYERS; i++) expect(join(lobby, `Player${i}`).ok).toBe(true);
    expect(join(lobby, 'OneTooMany')).toEqual({ ok: false, reason: 'full' });
  });

  it('never reuses an id, but reuses the lowest free livery', () => {
    const lobby = new Lobby();
    join(lobby, 'Alpha');
    join(lobby, 'Bravo');
    join(lobby, 'Charlie');
    lobby.leave('p1');
    expect(join(lobby, 'Delta')).toEqual({
      ok: true,
      player: { id: 'p4', nickname: 'Delta', livery: 0 },
    });
    expect(lobby.players().map((p) => p.id)).toEqual(['p2', 'p3', 'p4']);
  });
});
