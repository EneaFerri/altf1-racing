import type { InputCommand } from '@altf1/shared';
import {
  ACTION_KEYS,
  DRIVE_KEYS,
  inputFromKeys,
  TICK_TRIGGER_KEYS,
  type ActionName,
  type TickTrigger,
} from './bindings';

const DRIVE_CODES = new Set<string>(Object.values(DRIVE_KEYS).flat());

/** Turns keyboard events into InputCommands (sampled per tick) and one-shot action callbacks. */
export class KeyboardController {
  private readonly held = new Set<string>();
  /** Triggers pressed since the last sample; consumed by the next tick. */
  private readonly pendingTriggers = new Set<TickTrigger>();
  private readonly actionHandlers = new Map<ActionName, () => void>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    // Without this, a key held while the window loses focus would stay "stuck" down.
    target.addEventListener('blur', this.onBlur);
  }

  /** Call once per tick: tick triggers are delivered once, then cleared. */
  sample(): InputCommand {
    const input = inputFromKeys(this.held, this.pendingTriggers);
    this.pendingTriggers.clear();
    return input;
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
    // Typing a value into a field (e.g. the tuning panel) must not drive the car.
    if (isTextField(event.target)) return;
    if (DRIVE_CODES.has(event.code)) {
      event.preventDefault(); // e.g. Space would scroll the page
      this.held.add(event.code);
      return;
    }
    const trigger = keyFor(TICK_TRIGGER_KEYS, event.code);
    if (trigger) {
      event.preventDefault();
      if (!event.repeat) this.pendingTriggers.add(trigger);
      return;
    }
    const action = keyFor(ACTION_KEYS, event.code);
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

/** Name of the binding in `map` that uses key `code`, if any. */
function keyFor<K extends string>(map: Record<K, readonly string[]>, code: string): K | undefined {
  return (Object.keys(map) as K[]).find((name) => map[name].includes(code));
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
