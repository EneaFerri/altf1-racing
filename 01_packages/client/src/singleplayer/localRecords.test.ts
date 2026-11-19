import { describe, expect, it } from 'vitest';
import { LocalRecords, type RecordStore } from './localRecords';

/** An in-memory store, like `localStorage`. */
function memoryStore(): RecordStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('LocalRecords', () => {
  it('keeps the best lap per circuit, across instances (page loads)', () => {
    const store = memoryStore();
    const records = new LocalRecords(store);
    expect(records.best('Monza')).toBeNull();
    expect(records.submit('Monza', 5000)).toBe(true);
    expect(records.submit('Monza', 5100)).toBe(false); // slower
    expect(records.submit('Monza', 5000)).toBe(false); // equal
    expect(records.submit('Monaco', 4200)).toBe(true);
    expect(records.submit('Monza', 4900)).toBe(true);
    const reloaded = new LocalRecords(store);
    expect(reloaded.best('Monza')).toBe(4900);
    expect(reloaded.best('Monaco')).toBe(4200);
  });

  it('works without storage, or with storage that throws or holds garbage', () => {
    const none = new LocalRecords(null);
    expect(none.submit('Monza', 5000)).toBe(true);
    expect(none.best('Monza')).toBeNull();

    const broken: RecordStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(new LocalRecords(broken).best('Monza')).toBeNull();
    expect(new LocalRecords(broken).submit('Monza', 5000)).toBe(true);

    const garbage = memoryStore();
    garbage.setItem('altf1.timeTrial.best', '{"Monza":"fast","Monaco":-3,"Singapore":6000');
    expect(new LocalRecords(garbage).best('Singapore')).toBeNull();
    garbage.setItem('altf1.timeTrial.best', '{"Monza":"fast","Monaco":-3,"Singapore":6000}');
    const records = new LocalRecords(garbage);
    expect(records.best('Monza')).toBeNull();
    expect(records.best('Monaco')).toBeNull();
    expect(records.best('Singapore')).toBe(6000);
  });
});
