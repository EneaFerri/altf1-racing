import { ModeMenu } from './view/menu/ModeMenu';

/**
 * Bootstrap only: the start screen, then the chosen mode, loaded on demand so the other mode's
 * code is never fetched (singleplayer and multiplayer stay apart, see 01_docs/multiplayer.md).
 */
async function main(): Promise<void> {
  const mode = await new ModeMenu().choose();
  if (mode === 'singleplayer') {
    await (await import('./singleplayer/start')).startSinglePlayer();
  } else {
    await (await import('./multiplayer/start')).startMultiplayer();
  }
}

void main();
