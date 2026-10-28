import {
  MAX_PLAYERS,
  NICKNAME_RULES,
  ONLINE_MODES,
  type NicknameProblem,
  type OnlineMode,
  type RejectReason,
  type RoomInfo,
} from '@altf1/shared';
import type { ListMenuItem } from '../view/menu/ListMenu';

/**
 * Why the lobby can't go on: the server's reasons plus what can go wrong on the way to it, and a
 * circuit whose Grand Prix has started.
 */
export type LobbyProblem = RejectReason | 'unreachable' | 'disconnected' | 'inProgress';

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
    case 'inProgress':
      return 'A Grand Prix is in progress on this circuit — try another one';
  }
}

/** How each online mode is called in the menus. */
export const MODE_NAMES: Readonly<Record<OnlineMode, string>> = {
  practice: 'Free practice',
  timeTrial: 'Time trial',
  grandPrix: 'Grand Prix',
};

/**
 * The mode menu's rows, every mode in order: the ones the server offers rooms for with how many
 * are playing, the others disabled as work in progress.
 */
export function modeItems(rooms: readonly RoomInfo[]): ListMenuItem<OnlineMode>[] {
  return ONLINE_MODES.map((mode) => {
    const offered = rooms.filter((room) => room.mode === mode);
    const players = offered.reduce((sum, room) => sum + room.players, 0);
    return {
      name: MODE_NAMES[mode],
      detail:
        offered.length === 0 ? 'Work in progress' : players === 0 ? 'empty' : `${players} online`,
      value: mode,
      disabled: offered.length === 0,
    };
  });
}

/** The track menu's rows for `mode`: circuits this game knows, with who is on each. */
export function trackItems(
  mode: OnlineMode,
  rooms: readonly RoomInfo[],
  known: (track: string) => boolean,
): ListMenuItem<string>[] {
  return rooms
    .filter((room) => room.mode === mode && known(room.track))
    .map((room) => ({
      name: room.track,
      detail:
        room.status === 'running'
          ? 'GP in progress'
          : room.players === 0
            ? 'empty'
            : `${room.players} online`,
      value: room.track,
      disabled: room.status === 'running',
    }));
}
