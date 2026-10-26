import {
  MAX_PLAYERS,
  NICKNAME_RULES,
  type NicknameProblem,
  type RejectReason,
} from '@altf1/shared';

/** Why the lobby can't go on: the server's reasons plus what can go wrong on the way to it. */
export type LobbyProblem = RejectReason | 'unreachable' | 'disconnected';

/** Hint under the nickname field while typing. */
export function nicknameProblemText(problem: NicknameProblem): string {
  switch (problem) {
    case 'tooShort':
      return `At least ${NICKNAME_RULES.minLength} characters`;
    case 'tooLong':
      return `At most ${NICKNAME_RULES.maxLength} characters`;
    case 'badChars':
      return 'Only letters, digits, space, _ and -';
  }
}

/** Message shown when joining fails or the connection ends. */
export function lobbyProblemText(problem: LobbyProblem): string {
  switch (problem) {
    case 'taken':
      return 'Nickname already in use — pick another one';
    case 'invalid':
      return 'Nickname not allowed';
    case 'full':
      return `Server full (${MAX_PLAYERS} players) — try again later`;
    case 'version':
      return 'This game is out of date — reload the page';
    case 'unreachable':
      return 'Server unreachable — is it running? (npm run server)';
    case 'disconnected':
      return 'Disconnected from the server';
  }
}
