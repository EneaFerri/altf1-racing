import { ListMenu } from './ListMenu';

export type GameMode = 'singleplayer' | 'multiplayer';

/** Start screen: Singleplayer or Multiplayer. The two modes never mix (01_docs/multiplayer.md). */
export class ModeMenu {
  private readonly menu = new ListMenu<GameMode>({
    label: 'MODE',
    items: [
      { name: 'Singleplayer', detail: 'tracks · bot', value: 'singleplayer' },
      { name: 'Multiplayer', detail: 'online lobby', value: 'multiplayer' },
    ],
    hint: 'W/S · Enter',
  });

  /** Shows the menu and resolves with the chosen mode. */
  choose(): Promise<GameMode> {
    return this.menu.choose();
  }
}
