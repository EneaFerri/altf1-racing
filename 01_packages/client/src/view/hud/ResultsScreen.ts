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
  /** Pit stops made over the required ones (`1/2`; just `1` when none is required). */
  readonly stops: string;
  /** Fewer stops than required: drawn red. */
  readonly stopsShort: boolean;
  /** The time penalty for the missing stops (`+25 s`), empty without one. */
  readonly penalty: string;
  /** Holds the fastest lap of the race (purple, F1 style). */
  readonly fastest: boolean;
  /** This player's own row, highlighted. */
  readonly own: boolean;
  /** Single player's Grand Prix (S.6): the driver's team and the race's points (TEAM, PTS columns). */
  readonly team?: string;
  readonly points?: string;
}

/** A line of the constructors' card (single player's Grand Prix, S.6). */
export interface ConstructorRow {
  readonly position: string;
  readonly name: string;
  readonly color: string;
  /** Its drivers with their points (`Russell 25 · Antonelli 12`). */
  readonly drivers: string;
  readonly points: string;
  /** The player's team, highlighted. */
  readonly own: boolean;
}

/** `next`: on to the constructors' card (single player); else play again or leave. */
export type ResultsChoice = 'playAgain' | 'exit' | 'next';

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

  /**
   * Shows the classification card; resolves with the player's choice (the card closes). `first`:
   * the row above Exit (Play again online; on to the constructors in single player).
   */
  classification(
    title: string,
    rows: readonly ClassificationRow[],
    first: ListMenuItem<ResultsChoice>,
  ): Promise<ResultsChoice> {
    return this.card(title, table(rows), first);
  }

  /** Shows the constructors' card (single player's Grand Prix); resolves with the choice. */
  constructors(
    title: string,
    rows: readonly ConstructorRow[],
    first: ListMenuItem<ResultsChoice>,
  ): Promise<ResultsChoice> {
    return this.card(title, constructorTable(rows), first);
  }

  private card(
    title: string,
    content: HTMLElement,
    first: ListMenuItem<ResultsChoice>,
  ): Promise<ResultsChoice> {
    this.menu = new ListMenu<ResultsChoice>({
      label: title,
      content,
      items: [first, { name: 'Exit', detail: 'Back to the start', value: 'exit' }],
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
  // Single player's Grand Prix adds the team and the points.
  const scored = rows.some((row) => row.points !== undefined);
  const heads = scored
    ? ['POS', 'DRIVER', 'TEAM', 'GAP', 'FASTEST LAP', 'STOPS', 'PENALTY', 'PTS']
    : ['POS', 'DRIVER', 'GAP', 'FASTEST LAP', 'STOPS', 'PENALTY'];
  const root = element('div', 'results-table');
  if (scored) root.classList.add('results-scored');
  root.append(...heads.map((head) => element('span', 'results-head', head)));
  for (const row of rows) {
    const own = row.own ? ' results-own' : '';
    root.append(
      element('span', `results-pos${own}`, row.position),
      nameCell(row.name, row.color, own),
      ...(scored ? [element('span', `results-team${own}`, row.team ?? '')] : []),
      element('span', `results-gap${own}`, row.gap),
      element('span', `results-best${own}${row.fastest ? ' results-fastest' : ''}`, row.bestLap),
      element('span', `results-stops${own}${row.stopsShort ? ' results-short' : ''}`, row.stops),
      element('span', 'results-penalty', row.penalty),
      ...(scored ? [element('span', `results-points${own}`, row.points ?? '')] : []),
    );
  }
  return root;
}

/** The constructors' card: POS · TEAM · DRIVERS · PTS. */
function constructorTable(rows: readonly ConstructorRow[]): HTMLElement {
  const root = element('div', 'results-table results-constructors');
  root.append(
    ...['POS', 'TEAM', 'DRIVERS', 'PTS'].map((head) => element('span', 'results-head', head)),
  );
  for (const row of rows) {
    const own = row.own ? ' results-own' : '';
    root.append(
      element('span', `results-pos${own}`, row.position),
      nameCell(row.name, row.color, own),
      element('span', `results-team${own}`, row.drivers),
      element('span', `results-points${own}`, row.points),
    );
  }
  return root;
}

/** A name with its colour swatch. */
function nameCell(text: string, color: string, own: string): HTMLElement {
  const name = element('span', `results-name${own}`);
  const swatch = element('span', 'results-swatch');
  swatch.style.background = color;
  name.append(swatch, text);
  return name;
}
