import { TRACKS } from '@altf1/shared';
import { TrackMenu } from '../view/menu/TrackMenu';
import { SinglePlayerGame } from './SinglePlayerGame';

/** Single player: pick a track, then race it with the bot. Never touches the network. */
export async function startSinglePlayer(): Promise<void> {
  const track = await new TrackMenu(TRACKS).choose();
  new SinglePlayerGame(track).start();
}
