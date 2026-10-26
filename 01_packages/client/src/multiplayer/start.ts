import {
  checkNickname,
  PROTOCOL_VERSION,
  type PlayerInfo,
  type ServerMessage,
} from '@altf1/shared';
import { LobbyScreen } from '../view/menu/LobbyScreen';
import { NicknameScreen } from '../view/menu/NicknameScreen';
import { lobbyProblemText, nicknameProblemText } from './lobbyText';
import { NetClient } from './NetClient';
import { serverUrl } from './serverUrl';

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

/** A connection the server accepted. */
interface Session {
  readonly client: NetClient;
  readonly welcome: Welcome;
}

/**
 * Multiplayer entry point: nickname → join the server → the lobby with everyone online.
 * The race view arrives in 2.1f. Never touches single-player code (01_docs/multiplayer.md).
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
  showLobby(session!);
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

/** The players online, kept up to date; Esc leaves (the reload closes the socket). */
function showLobby({ client, welcome }: Session): void {
  const screen = new LobbyScreen(
    `ONLINE · ${welcome.track.toUpperCase()}`,
    'Race view coming next — Esc: leave',
  );
  const update = (players: readonly PlayerInfo[]): void =>
    screen.setRows(
      players.map((p) => ({
        name: p.nickname,
        detail: p.id === welcome.playerId ? 'you' : 'online',
        own: p.id === welcome.playerId,
      })),
    );
  update(welcome.players);
  client.onMessage((message) => {
    if (message.type === 'players') update(message.players);
    // Snapshots already stream in; drawing the race is step 2.1f.
  });
  client.onClose(() => screen.showMessage(lobbyProblemText('disconnected')));
  screen.show();
}
