import { describe, expect, it } from 'vitest';
import {
  lobbyProblemText,
  modeItems,
  nicknameProblemText,
  trackItems,
  type LobbyProblem,
} from './lobbyText';

describe('lobby texts', () => {
  it('explain every nickname problem with the actual limits', () => {
    expect(nicknameProblemText('tooShort')).toContain('3');
    expect(nicknameProblemText('tooLong')).toContain('16');
    expect(nicknameProblemText('badChars')).toContain('letters');
  });

  it('have a distinct message for every reason the lobby can fail', () => {
    const problems: LobbyProblem[] = [
      'taken',
      'invalid',
      'full',
      'version',
      'unreachable',
      'disconnected',
      'inProgress',
    ];
    const texts = problems.map(lobbyProblemText);
    expect(new Set(texts).size).toBe(problems.length);
    expect(lobbyProblemText('taken')).toContain('already in use');
    expect(lobbyProblemText('full')).toContain('8');
  });
});

describe('mode menu', () => {
  it('lists every mode: offered ones with who is playing, the others as work in progress', () => {
    const items = modeItems([
      { mode: 'practice', track: 'Monza', players: 2, status: 'open' },
      { mode: 'practice', track: 'Monaco', players: 1, status: 'open' },
    ]);
    expect(items).toEqual([
      { name: 'Free practice', detail: '3 online', value: 'practice', disabled: false },
      { name: 'Time trial', detail: 'Work in progress', value: 'timeTrial', disabled: true },
      { name: 'Grand Prix', detail: 'Work in progress', value: 'grandPrix', disabled: true },
    ]);
    expect(
      modeItems([{ mode: 'practice', track: 'Monza', players: 0, status: 'open' }])[0]!.detail,
    ).toBe('empty');
  });

  it("lists a mode's circuits; one with a Grand Prix under way can't be chosen", () => {
    const items = trackItems(
      'grandPrix',
      [
        { mode: 'practice', track: 'Monza', players: 3, status: 'open' },
        { mode: 'grandPrix', track: 'Monza', players: 2, status: 'running' },
        { mode: 'grandPrix', track: 'Monaco', players: 1, status: 'open' },
        { mode: 'grandPrix', track: 'Atlantis', players: 0, status: 'open' },
      ],
      (track) => track !== 'Atlantis',
    );
    expect(items).toEqual([
      { name: 'Monza', detail: 'GP in progress', value: 'Monza', disabled: true },
      { name: 'Monaco', detail: '1 online', value: 'Monaco', disabled: false },
    ]);
  });
});
