import { element } from './dom';
import './menu.css';

export interface LobbyRow {
  readonly name: string;
  readonly detail: string;
  /** Highlights the local player's row. */
  readonly own: boolean;
}

/**
 * Who is online in the multiplayer room, updated live. Esc leaves (back to the start screen).
 * Knows nothing about the network: the caller feeds rows and messages.
 */
export class LobbyScreen {
  private readonly root = element('div', 'menu');
  private readonly rows = element('div', 'menu-rows');
  private readonly message = element('p', 'menu-field-hint menu-error');

  constructor(label: string, hint: string) {
    const panel = element('div', 'menu-panel');
    this.message.hidden = true;
    panel.append(
      element('h1', 'menu-title', 'AltF1 Racing'),
      element('p', 'menu-label', label),
      this.rows,
      this.message,
      element('p', 'menu-hint', hint),
    );
    this.root.append(panel);
  }

  show(): void {
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKeyDown);
  }

  setRows(rows: readonly LobbyRow[]): void {
    this.rows.replaceChildren(
      ...rows.map(({ name, detail, own }) => {
        const row = element(
          'div',
          own ? 'menu-row menu-static menu-selected' : 'menu-row menu-static',
        );
        row.append(element('span', 'menu-name', name), element('span', 'menu-detail', detail));
        return row;
      }),
    );
  }

  /** A line in red under the list, e.g. when the connection is lost. */
  showMessage(text: string): void {
    this.message.textContent = text;
    this.message.hidden = false;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    location.reload();
  };
}
