import { buildTrack, type TrackDefinition } from '@altf1/shared';
import { ListMenu } from './ListMenu';

/** Single player's track choice: every track with its length. Esc goes back to the mode menu. */
export class TrackMenu {
  private readonly menu: ListMenu<TrackDefinition>;

  constructor(tracks: readonly TrackDefinition[]) {
    this.menu = new ListMenu({
      label: 'TRACK',
      items: tracks.map((definition) => ({
        name: definition.name,
        detail: `${(buildTrack(definition).length / 1000).toFixed(2)} km`,
        value: definition,
      })),
      hint: 'W/S · Enter — Esc: back · Esc in race: back to the start',
      escGoesBack: true,
    });
  }

  /** Shows the menu and resolves with the chosen track. */
  choose(): Promise<TrackDefinition> {
    return this.menu.choose();
  }
}
