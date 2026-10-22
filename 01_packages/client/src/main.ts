import { TRACKS } from '@altf1/shared';
import { Game } from './core/Game';
import { TrackMenu } from './view/menu/TrackMenu';

void new TrackMenu(TRACKS).choose().then((track) => new Game(track).start());
