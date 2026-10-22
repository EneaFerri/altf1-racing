import { buildTrack, type TrackDefinition } from '@altf1/shared';
import './menu.css';

const UP_KEYS = ['KeyW', 'ArrowUp'];
const DOWN_KEYS = ['KeyS', 'ArrowDown'];
const CONFIRM_KEYS = ['Enter', 'NumpadEnter', 'Space'];

/** Start screen: pick a track with the mouse, or W/S (↑/↓) + Enter. Removes itself once chosen. */
export class TrackMenu {
  private readonly root = element('div', 'menu');
  private readonly rows: HTMLButtonElement[];
  private selected = 0;
  private resolve: ((track: TrackDefinition) => void) | null = null;

  constructor(private readonly tracks: readonly TrackDefinition[]) {
    const panel = element('div', 'menu-panel');
    panel.append(element('h1', 'menu-title', 'AltF1 Racing'), element('p', 'menu-label', 'TRACK'));
    this.rows = tracks.map((definition, index) => {
      const row = trackRow(
        definition.name,
        `${(buildTrack(definition).length / 1000).toFixed(2)} km`,
      );
      row.addEventListener('mouseenter', () => this.select(index));
      row.addEventListener('click', () => this.confirm(index));
      return row;
    });
    panel.append(...this.rows, element('p', 'menu-hint', 'W/S · Enter — Esc in race: back here'));
    this.root.append(panel);
    this.select(0);
  }

  /** Shows the menu and resolves with the chosen track. */
  choose(): Promise<TrackDefinition> {
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKeyDown);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private select(index: number): void {
    this.selected = (index + this.rows.length) % this.rows.length;
    this.rows.forEach((row, i) => row.classList.toggle('menu-selected', i === this.selected));
  }

  private confirm(index: number): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
    this.resolve?.(this.tracks[index]!);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (UP_KEYS.includes(event.code)) this.select(this.selected - 1);
    else if (DOWN_KEYS.includes(event.code)) this.select(this.selected + 1);
    else if (CONFIRM_KEYS.includes(event.code)) this.confirm(this.selected);
    else return;
    event.preventDefault();
  };
}

function trackRow(name: string, detail: string): HTMLButtonElement {
  const row = element('button', 'menu-row');
  row.append(element('span', 'menu-name', name), element('span', 'menu-detail', detail));
  return row;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
