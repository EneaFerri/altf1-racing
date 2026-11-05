import {
  checkNickname,
  PROTOCOL_VERSION,
  RECORD_MODES,
  RECORDS_PER_TRACK,
  type OnlineMode,
  type RecordBoard,
  type RecordMode,
  type RoomInfo,
  type ServerMessage,
} from '@altf1/shared';
import { ListMenu } from '../view/menu/ListMenu';
import { NicknameScreen } from '../view/menu/NicknameScreen';
import { RecordTable } from '../view/menu/RecordTable';
import { loadTheme } from '../view/themes/theme';
import {
  lobbyProblemText,
  MODE_NAMES,
  modeItems,
  nicknameProblemText,
  trackItems,
} from './lobbyText';
import { NetClient } from './NetClient';
import { OnlineGame, trackByName, type Entered } from './OnlineGame';
import { boardFor, NO_RECORDS_TEXT, recordRows } from './recordsText';
import { serverUrl } from './serverUrl';

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

/** A connection the server accepted. */
interface Session {
  readonly client: NetClient;
  readonly welcome: Welcome;
  readonly nickname: string;
}

/**
 * Multiplayer entry point: nickname → join the server → pick a mode and a circuit → onto that room's
 * track with everyone who picked it. Never touches single-player code (01_docs/multiplayer.md).
 */
export async function startMultiplayer(): Promise<void> {
  let session: Session | null = null;
  await new NicknameScreen({
    validate: (raw) => {
      const check = checkNickname(raw);
      return check.ok ? null : nicknameProblemText(check.reason);
    },
    submit: async (raw) => {
      const result = await join(raw);
      if (typeof result === 'string') return result;
      session = result;
      return null;
    },
  }).choose();
  const { client, welcome, nickname } = session!;
  // From here on (track menu or race) a lost connection shows the DISCONNECTED menu.
  client.onClose(() => void showDisconnected());

  const mode = await chooseMode(welcome.rooms);
  const track = await chooseRoom(mode, welcome.rooms, welcome.records, nickname);
  // The look first, so the race starts drawing as soon as the room is entered.
  const theme = await loadTheme(track);
  const entered = await enter(client, mode, track);
  if (!entered) return showRefused();
  new OnlineGame(client, welcome.playerId, entered, mode, trackByName(track)!, theme).start();
}

/** Connects and says hello: the accepted session, or the text explaining why not. */
async function join(raw: string): Promise<Session | string> {
  const check = checkNickname(raw);
  if (!check.ok) return nicknameProblemText(check.reason);
  const client = new NetClient();
  try {
    await client.connect(serverUrl(location));
  } catch {
    return lobbyProblemText('unreachable');
  }
  return new Promise((resolve) => {
    client.onMessage((message) => {
      if (message.type === 'welcome') {
        resolve({ client, welcome: message, nickname: check.nickname });
      } else if (message.type === 'rejected') resolve(lobbyProblemText(message.reason));
    });
    // Rejected connections are closed by the server; the rejection text arrived first.
    client.onClose(() => resolve(lobbyProblemText('disconnected')));
    client.send({ type: 'hello', protocol: PROTOCOL_VERSION, nickname: check.nickname });
  });
}

/** Every online mode; the ones the server doesn't offer yet are shown as work in progress. */
function chooseMode(rooms: readonly RoomInfo[]): Promise<OnlineMode> {
  return new ListMenu({
    label: 'MULTIPLAYER · MODE',
    items: modeItems(rooms),
    hint: 'W/S · Enter — Esc: back to the start',
    escGoesBack: true,
  }).choose();
}

/**
 * The circuits the server offers in `mode` (and this game knows), with who is on each; in a mode
 * with lap records, the selected circuit's top times above them (`nickname`'s own highlighted).
 */
function chooseRoom(
  mode: OnlineMode,
  rooms: readonly RoomInfo[],
  records: readonly RecordBoard[],
  nickname: string,
): Promise<string> {
  const table = RECORD_MODES.includes(mode as RecordMode) ? new RecordTable() : null;
  return new ListMenu({
    label: `${MODE_NAMES[mode].toUpperCase()} · TRACK`,
    items: trackItems(mode, rooms, (track) => trackByName(track) !== null),
    ...(table && {
      content: table.root,
      onSelect: (track: string) =>
        table.show(
          `${track.toUpperCase()} · TOP ${RECORDS_PER_TRACK}`,
          recordRows(boardFor(records, mode, track), nickname),
          NO_RECORDS_TEXT,
        ),
    }),
    hint: 'W/S · Enter — Esc: back to the start',
    escGoesBack: true,
  }).choose();
}

/**
 * Asks to enter the room of `mode` on `track` and waits for the server's answer: null if refused
 * (its Grand Prix started after the welcome listed it as open).
 */
function enter(client: NetClient, mode: OnlineMode, track: string): Promise<Entered | null> {
  return new Promise((resolve) => {
    client.onMessage((message) => {
      if (message.type === 'entered') resolve(message);
      else if (message.type === 'refused') resolve(null);
    });
    client.send({ type: 'enter', mode, track });
  });
}

/** Shown when the chosen Grand Prix has just started; Enter or Esc goes back to the start screen. */
async function showRefused(): Promise<void> {
  await new ListMenu({
    label: 'GRAND PRIX',
    items: [{ name: 'Back to the start', detail: lobbyProblemText('inProgress'), value: null }],
    hint: 'Enter / Esc',
    escGoesBack: true,
  }).choose();
  location.reload();
}

/** Shown when the server goes away; Enter or Esc goes back to the start screen. */
async function showDisconnected(): Promise<void> {
  await new ListMenu({
    label: 'DISCONNECTED',
    items: [{ name: 'Back to the start', detail: lobbyProblemText('disconnected'), value: null }],
    hint: 'Enter / Esc',
    escGoesBack: true,
  }).choose();
  location.reload();
}
