/** The race control board (top right): what a driver must do now. Empty: hidden. */
export interface RaceControlContent {
  /** The yellow flags out (R.2): `YELLOW FLAG · SECTOR 2`; null: none. */
  readonly flag: string | null;
  /** `SAFETY CAR`, `SAFETY CAR IN THIS LAP` or `SAFETY CAR ENDING`; null: hidden. */
  readonly title: string | null;
  /** The rule now: no overtaking (until the line at the restart). */
  readonly rule: string | null;
  /** The player's delta (`+1.2`: fine, slower than the reference; `−0.3`: too fast). */
  readonly delta: { readonly text: string; readonly ok: boolean } | null;
  /** Beating the delta: `BACK ABOVE YOUR DELTA · 4 s`, the seconds left before the penalty. */
  readonly deltaWarning: string | null;
  /** An overtake the player must give back, and the seconds left to. */
  readonly giveBack: string | null;
}

/** How long a notice (a penalty, the green flag) stays up (ms). */
const NOTICE_MS = 5000;

/**
 * The race control board, top right, like the race director's messages on an F1 screen: the
 * yellow flags out (R.2), the safety car (R.3: the blinking `SAFETY CAR` title, the rule, the
 * player's delta: green fine, red too fast, and the seconds left to get back above it; an overtake
 * to give back), penalty notices and the
 * green flag at its end for a few seconds. Reads state only.
 */
export class RaceControlBoard {
  private readonly root = element('div', 'race-control');
  private readonly flag = element('div', 'race-control-flag');
  private readonly title = element('div', 'race-control-title');
  private readonly rule = element('div', 'race-control-rule');
  private readonly delta = element('div', 'race-control-delta');
  private readonly deltaWarning = element('div', 'race-control-delta-warning');
  private readonly giveBack = element('div', 'race-control-giveback');
  private readonly notice = element('div', 'race-control-notice');
  private noticeUntil = 0;
  private shownKey = '';

  constructor() {
    this.root.append(this.flag, this.title, this.rule, this.delta);
    this.root.append(this.deltaWarning, this.giveBack, this.notice);
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  /** Call every frame with what to show (`nowMs`: performance.now(), for the notices). */
  update(content: RaceControlContent, nowMs: number): void {
    const notice = nowMs < this.noticeUntil ? this.notice.textContent : '';
    const key = JSON.stringify([content, notice]);
    if (key === this.shownKey) return;
    this.shownKey = key;
    show(this.flag, content.flag);
    show(this.title, content.title);
    show(this.rule, content.rule);
    show(this.delta, content.delta?.text ?? null);
    this.delta.classList.toggle('race-control-delta-bad', content.delta?.ok === false);
    show(this.deltaWarning, content.deltaWarning);
    show(this.giveBack, content.giveBack);
    this.notice.hidden = !notice;
    this.root.hidden = !content.flag && !content.title && !content.giveBack && !notice;
  }

  /** A penalty for the player, or the green flag (`green`): shown for a few seconds. */
  tell(text: string, nowMs: number, green = false): void {
    this.notice.textContent = text;
    this.notice.classList.toggle('race-control-notice-green', green);
    this.noticeUntil = nowMs + NOTICE_MS;
    this.shownKey = '';
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}

function show(el: HTMLElement, text: string | null): void {
  el.hidden = text === null;
  if (text !== null && el.textContent !== text) el.textContent = text;
}

function element(tag: 'div', className: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
