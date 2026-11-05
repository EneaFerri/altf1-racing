import { describe, expect, it } from 'vitest';
import { MARSHAL_COLORS, MARSHAL_FRAMES, MARSHAL_HEIGHT, MARSHAL_WIDTH } from './flagMarshalArt';

describe('flag marshal art', () => {
  it('has two frames of the same size, drawn only in its own colours', () => {
    expect(MARSHAL_FRAMES).toHaveLength(2);
    for (const frame of MARSHAL_FRAMES) {
      expect(frame).toHaveLength(MARSHAL_HEIGHT);
      expect(frame.every((row) => row.length === MARSHAL_WIDTH)).toBe(true);
      const used = new Set(frame.join('').replace(/\./g, ''));
      expect([...used].every((c) => c in MARSHAL_COLORS)).toBe(true);
    }
  });

  it('waves: the chequered flag moves between the frames, she stays still', () => {
    const [a, b] = MARSHAL_FRAMES;
    const flag = (rows: readonly string[]) => rows.map((row) => row.slice(18)).join('\n');
    const body = (rows: readonly string[]) => rows.map((row) => row.slice(0, 18)).join('\n');
    expect(flag(a!)).not.toBe(flag(b!));
    expect(body(a!)).toBe(body(b!));
    expect(flag(a!)).toMatch(/K/);
    expect(flag(a!)).toMatch(/w/);
  });
});
