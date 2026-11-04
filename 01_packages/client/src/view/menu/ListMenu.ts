import { element } from './dom';
import './menu.css';

const UP_KEYS = ['KeyW', 'ArrowUp'];
const DOWN_KEYS = ['KeyS', 'ArrowDown'];
const CONFIRM_KEYS = ['Enter', 'NumpadEnter', 'Space'];
const BACK_KEYS = ['Escape'];

export interface ListMenuItem<T> {
  readonly name: string;
  readonly detail: string;
  readonly value: T;
  /** Shown dimmed, never selected nor chosen (e.g. a mode still in the works). */
  readonly disabled?: boolean;
}

export interface ListMenuOptions<T> {
  /** Small caps label above the rows, e.g. `TRACK`. */
  readonly label: string;
  readonly items: readonly ListMenuItem<T>[];
  /** Shown between the label and the rows (e.g. the Grand Prix classification). */
  readonly content?: HTMLElement;
  /** Called with the selected row's value, on showing and whenever the selection moves. */
  readonly onSelect?: (value: T) => void;
  readonly hint: string;
  /** Esc reloads the page, i.e. goes back to the start screen. Off for the start screen itself. */
  readonly escGoesBack?: boolean;
}

/**
 * Full-screen menu: pick a row with the mouse, or W/S (↑/↓) + Enter; disabled rows are skipped.
 * Removes itself once chosen.
 * Every menu (mode, track, …) is one of these, so they all look and behave the same.
 */
export class ListMenu<T> {
  private readonly root = element('div', 'menu');
  private readonly items: ListMenuItem<T>[];
  private readonly rows: HTMLButtonElement[];
  private selected = 0;
  /** Whether a row has been selected yet (the first `onSelect`). */
  private shown = false;
  private resolve: ((value: T) => void) | null = null;

  constructor(private readonly options: ListMenuOptions<T>) {
    const panel = element('div', 'menu-panel');
    panel.append(
      element('h1', 'menu-title', 'AltF1 Racing'),
      element('p', 'menu-label', options.label),
    );
    if (options.content) panel.append(options.content);
    this.items = [...options.items];
    this.rows = this.items.map((item, index) => {
      const row = element('button', 'menu-row');
      fillRow(row, item);
      row.addEventListener('mouseenter', () => this.select(index));
      row.addEventListener('click', () => this.confirm(index));
      return row;
    });
    panel.append(...this.rows, element('p', 'menu-hint', options.hint));
    this.root.append(panel);
    this.select(
      Math.max(
        0,
        this.items.findIndex((item) => !item.disabled),
      ),
    );
  }

  /** Shows the menu and resolves with the chosen item's value. */
  choose(): Promise<T> {
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKeyDown);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** Replaces row `index` while the menu is up; a row being disabled loses the selection. */
  setItem(index: number, item: ListMenuItem<T>): void {
    this.items[index] = item;
    fillRow(this.rows[index]!, item);
    if (item.disabled && this.selected === index) this.move(1);
  }

  private select(index: number): void {
    const item = this.items[index];
    if (!item || item.disabled) return;
    const moved = index !== this.selected || !this.shown;
    this.selected = index;
    this.shown = true;
    if (moved) this.options.onSelect?.(item.value);
    this.rows.forEach((row, i) => row.classList.toggle('menu-selected', i === this.selected));
  }

  /** Selects the next row that isn't disabled, `step` = -1 (up) or 1 (down), wrapping around. */
  private move(step: number): void {
    const n = this.rows.length;
    for (let k = 1; k < n; k++) {
      const index = (((this.selected + step * k) % n) + n) % n;
      if (!this.items[index]!.disabled) return this.select(index);
    }
  }

  private confirm(index: number): void {
    if (this.items[index]!.disabled) return;
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
    this.resolve?.(this.items[index]!.value);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (UP_KEYS.includes(event.code)) this.move(-1);
    else if (DOWN_KEYS.includes(event.code)) this.move(1);
    else if (CONFIRM_KEYS.includes(event.code)) this.confirm(this.selected);
    else if (this.options.escGoesBack && BACK_KEYS.includes(event.code)) location.reload();
    else return;
    event.preventDefault();
  };
}

function fillRow<T>(row: HTMLButtonElement, item: ListMenuItem<T>): void {
  row.disabled = item.disabled ?? false;
  row.replaceChildren(
    element('span', 'menu-name', item.name),
    element('span', 'menu-detail', item.detail),
  );
}
