import { element } from '../menu/dom';
import { ListMenu, type ListMenuItem } from '../menu/ListMenu';
import type { Livery } from '../pixelTexture';
import { pixelFigure } from './pixelFigure';
import './results.css';

/** View-only numbers of the results screen. */
export const RESULTS_PARAMS = {
  /** The podium stays this long before the classification opens (Enter opens it sooner). */
  podiumSeconds: 20,
} as const;

const SKIP_KEYS = ['Enter', 'NumpadEnter'];

/** A driver on the podium. */
export interface PodiumPlace {
  readonly name: string;
  readonly livery: Livery;
  /** Under the name: the winner's race time, the others' gap. */
  readonly note: string;
}

/** What the podium shows; built by the multiplayer code, so the view knows nothing of the network. */
export interface PodiumContent {
  readonly title: string;
  /** P1, P2, P3; fewer drivers leave the lower steps empty. */
  readonly places: readonly PodiumPlace[];
}

/** A line of the classification card. */
export interface ClassificationRow {
  readonly position: string;
  readonly name: string;
  readonly color: string;
  /** Race time (winner), gap, laps down or DNF. */
  readonly gap: string;
  readonly bestLap: string;
  /** Holds the fastest lap of the race (purple, F1 style). */
  readonly fastest: boolean;
  /** This player's own row, highlighted. */
  readonly own: boolean;
}

export type ResultsChoice = 'playAgain' | 'exit';

/**
 * The end of a Grand Prix, over the scene: the podium (three steps, each driver a pixel figure in
 * their livery swaying, the winner with the cup), then the classification card with Play again /
 * Exit (a `ListMenu`, so mouse, W/S + Enter and Esc work as in every menu).
 */
export class ResultsScreen {
  private menu: ListMenu<ResultsChoice> | null = null;

  /** Shows the podium; resolves once it closes (after `podiumSeconds`, or on Enter). */
  podium({ title, places }: PodiumContent): Promise<void> {
    const root = element('div', 'podium');
    const steps = element('div', 'podium-steps');
    // Left to right: P2, P1, P3.
    for (const position of [2, 1, 3]) {
      const place = places[position - 1];
      const step = element('div', `podium-place podium-p${position}`);
      if (place) {
        const figure = pixelFigure(place.livery, position === 1);
        figure.className = 'podium-figure';
        step.append(
          figure,
          element('span', 'podium-name', place.name),
          element('span', 'podium-note', place.note),
        );
      }
      const block = element('div', 'podium-block', String(position));
      block.style.setProperty('--podium-color', place?.livery.body ?? 'transparent');
      step.append(block);
      steps.append(step);
    }
    root.append(
      element('p', 'podium-title', title),
      steps,
      element('p', 'podium-hint', 'Enter: classification'),
    );
    document.body.append(root);
    return new Promise((resolve) => {
      const close = (): void => {
        clearTimeout(timer);
        window.removeEventListener('keydown', onKeyDown);
        root.remove();
        resolve();
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        if (!SKIP_KEYS.includes(event.code) || event.repeat) return;
        event.preventDefault();
        close();
      };
      const timer = setTimeout(close, RESULTS_PARAMS.podiumSeconds * 1000);
      window.addEventListener('keydown', onKeyDown);
    });
  }

  /** Shows the classification card; resolves with the player's choice (the card closes). */
  classification(
    title: string,
    rows: readonly ClassificationRow[],
    playAgain: ListMenuItem<ResultsChoice>,
  ): Promise<ResultsChoice> {
    this.menu = new ListMenu<ResultsChoice>({
      label: title,
      content: table(rows),
      items: [playAgain, { name: 'Exit', detail: 'Back to the start', value: 'exit' }],
      hint: 'W/S · Enter — Esc: back to the start',
      escGoesBack: true,
    });
    return this.menu.choose().finally(() => (this.menu = null));
  }

  /** Updates the Play again row while the card is up (the new GP may open or start meanwhile). */
  setPlayAgain(item: ListMenuItem<ResultsChoice>): void {
    this.menu?.setItem(0, item);
  }
}

function table(rows: readonly ClassificationRow[]): HTMLElement {
  const root = element('div', 'results-table');
  root.append(
    ...['POS', 'DRIVER', 'GAP', 'FASTEST LAP'].map((head) => element('span', 'results-head', head)),
  );
  for (const row of rows) {
    const own = row.own ? ' results-own' : '';
    const name = element('span', `results-name${own}`);
    const swatch = element('span', 'results-swatch');
    swatch.style.background = row.color;
    name.append(swatch, row.name);
    root.append(
      element('span', `results-pos${own}`, row.position),
      name,
      element('span', `results-gap${own}`, row.gap),
      element('span', `results-best${own}${row.fastest ? ' results-fastest' : ''}`, row.bestLap),
    );
  }
  return root;
}
