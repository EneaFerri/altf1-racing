import {
  checkNickname,
  PROTOCOL_VERSION,
  type OnlineMode,
  type RoomInfo,
  type ServerMessage,
} from '@altf1/shared';
import { ListMenu } from '../view/menu/ListMenu';
import { NicknameScreen } from '../view/menu/NicknameScreen';
import { lobbyProblemText, MODE_NAMES, modeItems, nicknameProblemText } from './lobbyText';
import { NetClient } from './NetClient';
import { OnlineGame, trackByName, type Entered } from './OnlineGame';
import { serverUrl } from './serverUrl';

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

/** A connection the server accepted. */
interface Session {
  readonly client: NetClient;
  readonly welcome: Welcome;
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
  const { client, welcome } = session!;
  // From here on (track menu or race) a lost connection shows the DISCONNECTED menu.
  client.onClose(() => void showDisconnected());

  const mode = await chooseMode(welcome.rooms);
  const track = await chooseRoom(mode, welcome.rooms);
  const entered = await enter(client, mode, track);
  new OnlineGame(client, welcome.playerId, entered, trackByName(track)!).start();
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
      if (message.type === 'welcome') resolve({ client, welcome: message });
      else if (message.type === 'rejected') resolve(lobbyProblemText(message.reason));
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

/** The circuits the server offers in `mode` (and this game knows), with who is on each. */
function chooseRoom(mode: OnlineMode, rooms: readonly RoomInfo[]): Promise<string> {
  return new ListMenu({
    label: `${MODE_NAMES[mode].toUpperCase()} · TRACK`,
    items: rooms
      .filter((room) => room.mode === mode && trackByName(room.track))
      .map((room) => ({
        name: room.track,
        detail: room.players === 0 ? 'empty' : `${room.players} online`,
        value: room.track,
      })),
    hint: 'W/S · Enter — Esc: back to the start',
    escGoesBack: true,
  }).choose();
}

/** Asks to enter the room of `mode` on `track` and waits for the server's answer. */
function enter(client: NetClient, mode: OnlineMode, track: string): Promise<Entered> {
  return new Promise((resolve) => {
    client.onMessage((message) => {
      if (message.type === 'entered') resolve(message);
    });
    client.send({ type: 'enter', mode, track });
  });
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
