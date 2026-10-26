import { element } from './dom';
import './menu.css';

/** Where the last nickname is remembered on this browser (convenience only). */
const STORAGE_KEY = 'altf1.nickname';

export interface NicknameScreenOptions {
  /** Hint for what's typed so far, or null when it's acceptable. */
  readonly validate: (raw: string) => string | null;
  /** Tries to join with `nickname`: resolves null on success, or the error text to show. */
  readonly submit: (nickname: string) => Promise<string | null>;
}

/**
 * Asks for a nickname: a text field with a live hint, Enter to join, Esc back to the start screen.
 * Knows nothing about the network: `submit` does the joining and returns what went wrong.
 */
export class NicknameScreen {
  private readonly root = element('div', 'menu');
  private readonly field = element('input', 'menu-field');
  private readonly hint = element('p', 'menu-field-hint');
  private busy = false;
  private resolve: ((nickname: string) => void) | null = null;

  constructor(private readonly options: NicknameScreenOptions) {
    const panel = element('div', 'menu-panel');
    this.field.type = 'text';
    this.field.maxLength = 32;
    this.field.autocomplete = 'off';
    this.field.spellcheck = false;
    this.field.placeholder = 'Your nickname';
    this.field.value = readStored();
    panel.append(
      element('h1', 'menu-title', 'AltF1 Racing'),
      element('p', 'menu-label', 'MULTIPLAYER · NICKNAME'),
      this.field,
      this.hint,
      element('p', 'menu-hint', 'Enter: join — Esc: back'),
    );
    this.root.append(panel);
    this.field.addEventListener('input', () => this.showHint());
    this.field.addEventListener('keydown', this.onKeyDown);
  }

  /** Shows the screen; resolves with the accepted nickname once `submit` succeeded. */
  choose(): Promise<string> {
    document.body.append(this.root);
    this.field.focus();
    this.showHint();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private showHint(error?: string): void {
    const text = error ?? this.options.validate(this.field.value);
    this.hint.textContent = text ?? 'Unique among the players online';
    this.hint.classList.toggle('menu-error', text !== null);
  }

  private async join(): Promise<void> {
    const nickname = this.field.value;
    const problem = this.options.validate(nickname);
    if (problem !== null || this.busy) return this.showHint(problem ?? undefined);
    this.busy = true;
    this.field.disabled = true;
    this.hint.textContent = 'Connecting…';
    this.hint.classList.remove('menu-error');
    const error = await this.options.submit(nickname);
    this.busy = false;
    this.field.disabled = false;
    if (error !== null) {
      this.showHint(error);
      this.field.focus();
      return;
    }
    writeStored(nickname.trim());
    this.root.remove();
    this.resolve?.(nickname);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Enter' || event.code === 'NumpadEnter') void this.join();
    else if (event.code === 'Escape') location.reload();
    else return;
    event.preventDefault();
  };
}

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStored(nickname: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, nickname);
  } catch {
    // private mode or storage blocked: just don't remember it
  }
}
