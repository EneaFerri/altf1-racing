import type { InputCommand } from '@altf1/shared';
import { ACTION_KEYS, DRIVE_KEYS, inputFromKeys, type ActionName } from './bindings';

const DRIVE_CODES = new Set<string>(Object.values(DRIVE_KEYS).flat());

/** Turns keyboard events into InputCommands (sampled per tick) and one-shot action callbacks. */
export class KeyboardController {
  private readonly held = new Set<string>();
  private readonly actionHandlers = new Map<ActionName, () => void>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    // Without this, a key held while the window loses focus would stay "stuck" down.
    target.addEventListener('blur', this.onBlur);
  }

  sample(): InputCommand {
    return inputFromKeys(this.held);
  }

  onAction(action: ActionName, handler: () => void): void {
    this.actionHandlers.set(action, handler);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (DRIVE_CODES.has(event.code)) {
      event.preventDefault(); // e.g. Space would scroll the page
      this.held.add(event.code);
      return;
    }
    const action = actionForCode(event.code);
    if (action) {
      event.preventDefault();
      if (!event.repeat) this.actionHandlers.get(action)?.();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
  };
}

function actionForCode(code: string): ActionName | undefined {
  return (Object.keys(ACTION_KEYS) as ActionName[]).find((action) =>
    (ACTION_KEYS[action] as readonly string[]).includes(code),
  );
}
