import { describe, expect, it } from 'vitest';
import { lobbyProblemText, nicknameProblemText, type LobbyProblem } from './lobbyText';

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
    ];
    const texts = problems.map(lobbyProblemText);
    expect(new Set(texts).size).toBe(problems.length);
    expect(lobbyProblemText('taken')).toContain('already in use');
    expect(lobbyProblemText('full')).toContain('8');
  });
});
