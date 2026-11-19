import { GP_TRACKS, offersRain, TEAMS, type TeamId, type Weather } from '@altf1/shared';
import { formatLapTime } from '../view/hud/format';
import { ListMenu } from '../view/menu/ListMenu';
import { TrackMenu, trackLength } from '../view/menu/TrackMenu';
import { loadTheme } from '../view/themes/theme';
import { LocalRecords } from './localRecords';
import { SinglePlayerGame } from './SinglePlayerGame';
import { SinglePlayerGrandPrix } from './SinglePlayerGrandPrix';

type Mode = 'grandPrix' | 'timeTrial' | 'test';

/** How each single-player mode is called in the menus, with what it offers. */
const MODES: readonly { name: string; detail: string; value: Mode }[] = [
  { name: 'Grand Prix', detail: 'your team · 9 bots', value: 'grandPrix' },
  { name: 'Time trial', detail: 'ghost · own records', value: 'timeTrial' },
  { name: 'Test', detail: 'bot · telemetry · tuning', value: 'test' },
];

const BACK = 'W/S · Enter — Esc: back to the start';

/**
 * Single player: pick a mode, then (Grand Prix) a team, then a circuit (in time trial with this
 * browser's best lap on it), then (Grand Prix, where it may rain) the weather, and drive it.
 * Never touches the network.
 */
export async function startSinglePlayer(): Promise<void> {
  const mode = await new ListMenu({
    label: 'SINGLEPLAYER · MODE',
    items: [...MODES],
    hint: BACK,
    escGoesBack: true,
  }).choose();
  if (mode === 'grandPrix') return startGrandPrix();
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

/** The Grand Prix against the bots: team, circuit, weather, then the race weekend. */
async function startGrandPrix(): Promise<void> {
  const team = await new ListMenu<TeamId>({
    label: 'GRAND PRIX · TEAM',
    items: TEAMS.map((t) => ({ name: t.name, detail: t.drivers.join(' · '), value: t.id })),
    hint: `${BACK} — you take the seat of one of its drivers`,
    escGoesBack: true,
  }).choose();
  const track = await new TrackMenu(GP_TRACKS, 'GRAND PRIX · TRACK').choose();
  const weather: Weather = offersRain(track.name)
    ? await new ListMenu<Weather>({
        label: 'GRAND PRIX · WEATHER',
        items: [
          { name: 'Dry', detail: 'a dry track', value: 'dry' },
          { name: 'Rain', detail: 'wet track, puddles', value: 'rain' },
        ],
        hint: BACK,
        escGoesBack: true,
      }).choose()
    : 'dry';
  new SinglePlayerGrandPrix(track, await loadTheme(track.name), team, weather).start();
}
