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
  /** The session's fastest lap is this driver's: its time, shown with a purple stopwatch. */
  readonly fastest?: string;
  /** In a race with mandatory pit stops: made / required (`1/2`), red while short of them. */
  readonly stops?: { readonly text: string; readonly short: boolean };
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
        if (row.fastest) item.append(fastestLap(row.fastest));
        if (row.pit) item.append(text('span', 'gp-pit', row.pit));
        if (row.stops) {
          const stops = text('span', 'gp-stops', row.stops.text);
          stops.classList.toggle('gp-stops-short', row.stops.short);
          item.append(stops);
        }
        item.append(text('span', 'gp-note', row.note));
        return item;
      }),
    );
    this.root.replaceChildren(text('p', 'gp-title', title), list);
    if (hint) this.root.append(text('p', 'gp-hint', hint));
  }
}

/** F1's fastest-lap mark: a purple pixel stopwatch and the lap's time. */
function fastestLap(time: string): HTMLElement {
  const mark = text('span', 'gp-fastest', time);
  mark.prepend(stopwatch());
  return mark;
}

/** A 9 × 10 pixel stopwatch (crown, button, dial with a hand), drawn in the current colour. */
function stopwatch(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 9 10');
  svg.setAttribute('class', 'gp-stopwatch');
  svg.setAttribute('shape-rendering', 'crispEdges');
  // [x, y, width, height]: crown, side button, the dial's ring, the hand.
  const pixels = [
    [3, 0, 3, 1],
    [4, 1, 1, 1],
    [7, 1, 1, 1],
    [2, 2, 5, 1],
    [1, 3, 1, 5],
    [7, 3, 1, 5],
    [0, 4, 1, 3],
    [8, 4, 1, 3],
    [2, 8, 5, 1],
    [4, 4, 1, 2],
    [5, 5, 1, 1],
  ];
  for (const [x, y, width, height] of pixels) {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', `${x}`);
    rect.setAttribute('y', `${y}`);
    rect.setAttribute('width', `${width}`);
    rect.setAttribute('height', `${height}`);
    rect.setAttribute('fill', 'currentColor');
    svg.append(rect);
  }
  return svg;
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
