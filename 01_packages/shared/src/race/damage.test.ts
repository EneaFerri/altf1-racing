import { describe, expect, it } from 'vitest';
import { damageInPhase } from './damage';

describe('damageInPhase', () => {
  it('is on in qualifying and the race only', () => {
    const phases = ['lobby', 'qualifying', 'grid', 'race', 'results'] as const;
    expect(phases.filter(damageInPhase)).toEqual(['qualifying', 'race']);
  });
});
