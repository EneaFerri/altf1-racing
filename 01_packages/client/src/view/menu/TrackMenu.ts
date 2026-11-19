import { buildTrack, type TrackDefinition } from '@altf1/shared';
import { ListMenu } from './ListMenu';

/** The track length shown in the menu by default (`3.34 km`). */
export function trackLength(definition: TrackDefinition): string {
  return `${(buildTrack(definition).length / 1000).toFixed(2)} km`;
}

/**
 * Single player's track choice: every track with a detail (its length unless `detail` says
 * otherwise, e.g. time trial's own best). Esc goes back to the start screen.
 */
export class TrackMenu {
  private readonly menu: ListMenu<TrackDefinition>;

  constructor(
    tracks: readonly TrackDefinition[],
    label = 'TRACK',
    detail: (definition: TrackDefinition) => string = trackLength,
  ) {
    this.menu = new ListMenu({
      label,
      items: tracks.map((definition) => ({
        name: definition.name,
        detail: detail(definition),
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
