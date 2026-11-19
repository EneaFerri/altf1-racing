/** Where the records live: `localStorage`, or a stand-in in tests. */
export interface RecordStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The `localStorage` key holding every circuit's best time trial lap. */
const KEY = 'altf1.timeTrial.best';

/**
 * Single player's time trial records: this browser's best valid lap per circuit (ticks), kept
 * in `localStorage`. Never trusted to be there: a private window or blocked storage just means
 * no records (reads give null, writes are dropped), and the game runs the same.
 */
export class LocalRecords {
  private readonly store: RecordStore | null;

  constructor(store: RecordStore | null = browserStore()) {
    this.store = store;
  }

  /** The best lap on `track` (ticks); null if none is saved. */
  best(track: string): number | null {
    return this.read()[track] ?? null;
  }

  /** Saves `ticks` on `track` if it beats the saved best; whether it did (a new record). */
  submit(track: string, ticks: number): boolean {
    const all = this.read();
    const best = all[track];
    if (best !== undefined && best <= ticks) return false;
    try {
      this.store?.setItem(KEY, JSON.stringify({ ...all, [track]: ticks }));
    } catch {
      // Storage full or blocked: the record lasts this session only (the HUD's best lap).
    }
    return true;
  }

  private read(): Record<string, number> {
    try {
      const parsed: unknown = JSON.parse(this.store?.getItem(KEY) ?? '{}');
      if (typeof parsed !== 'object' || parsed === null) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, number] =>
            Number.isInteger(entry[1]) && (entry[1] as number) > 0,
        ),
      );
    } catch {
      return {};
    }
  }
}

/** `localStorage`, or null where even touching it throws. */
function browserStore(): RecordStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
