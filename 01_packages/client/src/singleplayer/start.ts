import { GP_TRACKS } from '@altf1/shared';
import { formatLapTime } from '../view/hud/format';
import { ListMenu } from '../view/menu/ListMenu';
import { TrackMenu, trackLength } from '../view/menu/TrackMenu';
import { loadTheme } from '../view/themes/theme';
import { LocalRecords } from './localRecords';
import { SinglePlayerGame, type SinglePlayerMode } from './SinglePlayerGame';

/** How each single-player mode is called in the menus, with what it offers. */
const MODES: readonly { name: string; detail: string; value: SinglePlayerMode }[] = [
  { name: 'Free practice', detail: 'alone on the track', value: 'practice' },
  { name: 'Time trial', detail: 'ghost · own records', value: 'timeTrial' },
  { name: 'Test', detail: 'bot · telemetry · tuning', value: 'test' },
];

/**
 * Single player: pick a mode, then a circuit (in time trial with this browser's best lap on it),
 * then drive it. Never touches the network.
 */
export async function startSinglePlayer(): Promise<void> {
  const mode = await new ListMenu({
    label: 'SINGLEPLAYER · MODE',
    items: [...MODES],
    hint: 'W/S · Enter — Esc: back to the start',
    escGoesBack: true,
  }).choose();
  const records = new LocalRecords();
  const name = MODES.find((entry) => entry.value === mode)!.name;
  const track = await new TrackMenu(
    GP_TRACKS,
    `${name.toUpperCase()} · TRACK`,
    mode === 'timeTrial'
      ? (definition) => {
          const best = records.best(definition.name);
          return best === null ? 'no record yet' : `best ${formatLapTime(best)}`;
        }
      : trackLength,
  ).choose();
  new SinglePlayerGame(track, await loadTheme(track.name), mode, records).start();
}
