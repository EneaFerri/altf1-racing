import { describe, expect, it } from 'vitest';
import { GrandPrix } from './GrandPrix.ts';

describe('GrandPrix', () => {
  it('makes the first player in the manager, waiting in the lobby', () => {
    const gp = new GrandPrix();
    gp.add('p3');
    gp.add('p1');
    expect(gp.info).toEqual({ phase: 'lobby', manager: 'p3' });
    expect(gp.isOpen).toBe(true);
  });

  it('starts only on the manager’s command, and only once', () => {
    const gp = new GrandPrix();
    gp.add('p1');
    gp.add('p2');
    expect(gp.command('p2', 'start')).toBe(false);
    expect(gp.info.phase).toBe('lobby');
    expect(gp.command('p1', 'start')).toBe(true);
    expect(gp.info.phase).toBe('qualifying');
    expect(gp.isOpen).toBe(false);
    expect(gp.command('p1', 'start')).toBe(false);
  });

  it('hands the manager role to whoever has been there longest when the manager leaves', () => {
    const gp = new GrandPrix();
    for (const id of ['p1', 'p2', 'p3']) gp.add(id);
    gp.remove('p2');
    gp.remove('p1');
    expect(gp.info.manager).toBe('p3');
    expect(gp.command('p3', 'start')).toBe(true);
  });
});
