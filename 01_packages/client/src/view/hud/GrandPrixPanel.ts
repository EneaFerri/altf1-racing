import './hud.css';

/** One driver in the panel: name, livery colour and a note (e.g. `manager`). */
export interface GrandPrixRow {
  readonly name: string;
  readonly color: string;
  readonly note: string;
  /** This player's own row, highlighted. */
  readonly own: boolean;
  /** In the pit lane (Phase 4): `PIT`, or `BOX` while stopped in the box. */
  readonly pit?: PitBadge;
}

/** What the timing tower shows beside a driver in the pit lane. */
export type PitBadge = 'PIT' | 'BOX';

/** What the panel shows; built by the multiplayer code, so the view knows nothing of the network. */
export interface GrandPrixContent {
  readonly title: string;
  readonly rows: readonly GrandPrixRow[];
  /** What happens next, or what this player can do (empty = no line). */
  readonly hint: string;
}

/** Top-left Grand Prix panel: phase, the drivers (livery swatch, name, note) and a hint line. */
export class GrandPrixPanel {
  private readonly root = document.createElement('div');

  constructor() {
    this.root.className = 'gp-panel';
    document.body.appendChild(this.root);
  }

  /** Hidden while the results screen is up. */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  show({ title, rows, hint }: GrandPrixContent): void {
    const list = document.createElement('ol');
    list.append(
      ...rows.map((row) => {
        const item = document.createElement('li');
        item.classList.toggle('gp-own', row.own);
        const swatch = document.createElement('span');
        swatch.className = 'gp-swatch';
        swatch.style.background = row.color;
        item.append(swatch, text('span', 'gp-name', row.name));
        if (row.pit) item.append(text('span', 'gp-pit', row.pit));
        item.append(text('span', 'gp-note', row.note));
        return item;
      }),
    );
    this.root.replaceChildren(text('p', 'gp-title', title), list);
    if (hint) this.root.append(text('p', 'gp-hint', hint));
  }
}

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = content;
  return el;
}
