import { element } from './dom';

/** One line of a lap-record board, as text. */
export interface RecordRow {
  /** `1`, `2`, … */
  readonly position: string;
  readonly nickname: string;
  /** `1:23.456`. */
  readonly time: string;
  /** Day the lap was set, `2026-11-04`. */
  readonly date: string;
  /** The viewing player's own record: highlighted. */
  readonly own: boolean;
}

/**
 * The lap-record board shown in a menu (multiplayer track menu): a small timing table, the own
 * record highlighted, or one line of text when it is empty.
 */
export class RecordTable {
  readonly root = element('div', 'menu-records');
  private readonly title = element('p', 'menu-records-title');
  private readonly body = element('div', 'menu-records-body');

  constructor() {
    this.root.append(this.title, this.body);
  }

  show(title: string, rows: readonly RecordRow[], emptyText: string): void {
    this.title.textContent = title;
    if (rows.length === 0) {
      this.body.replaceChildren(element('p', 'menu-records-empty', emptyText));
      return;
    }
    this.body.replaceChildren(
      ...rows.map((row) => {
        const line = element(
          'div',
          row.own ? 'menu-records-row menu-records-own' : 'menu-records-row',
        );
        line.append(
          element('span', 'menu-records-pos', row.position),
          element('span', 'menu-records-name', row.nickname),
          element('span', 'menu-records-time', row.time),
          element('span', 'menu-records-date', row.date),
        );
        return line;
      }),
    );
  }
}
