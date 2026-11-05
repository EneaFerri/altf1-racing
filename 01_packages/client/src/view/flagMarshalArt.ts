/**
 * The flag marshal at the finish line (Grand Prix, last lap): pixel art as rows of characters,
 * two frames of the chequered flag waving. Pure (tested); `FlagMarshal` draws it.
 *
 * h/H hair (ponytail), f skin, e eyes, r blush, m mouth, J/j team jacket, W white collar and stripe,
 * P trousers, B boots, p flagpole, K/w the flag's black and white squares, `.` empty.
 */

export const MARSHAL_WIDTH = 28;
export const MARSHAL_HEIGHT = 40;

export const MARSHAL_COLORS: Readonly<Record<string, string>> = {
  h: '#7a4520',
  H: '#55301a',
  f: '#f1c7a3',
  e: '#2a1a12',
  r: '#f09a9a',
  m: '#d0445a',
  J: '#e10600',
  j: '#a00400',
  W: '#ffffff',
  P: '#1c2340',
  B: '#111114',
  p: '#c8c8cc',
  K: '#111114',
  w: '#f4f4f6',
};

/** One frame: `phase` moves the wave along the flag (0 and π: the two frames). */
function marshalFrame(phase: number): string[] {
  const grid = Array.from({ length: MARSHAL_HEIGHT }, () => Array<string>(MARSHAL_WIDTH).fill('.'));
  const fill = (x0: number, y0: number, x1: number, y1: number, c: string): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y]![x] = c;
  };
  // Ponytail behind, hair framing the face, a fringe; the face.
  fill(3, 6, 4, 16, 'H');
  fill(5, 3, 12, 5, 'h');
  fill(5, 6, 5, 11, 'h');
  fill(12, 6, 12, 11, 'h');
  fill(6, 6, 11, 10, 'f');
  fill(6, 6, 8, 6, 'h');
  fill(7, 7, 7, 7, 'e');
  fill(10, 7, 10, 7, 'e');
  fill(6, 9, 6, 9, 'r');
  fill(11, 9, 11, 9, 'r');
  fill(8, 9, 9, 9, 'm');
  fill(8, 11, 9, 11, 'f');
  // Team jacket: collar, stripe, shaded side; the left arm down, hand at the hip.
  fill(5, 12, 12, 22, 'J');
  fill(12, 13, 12, 22, 'j');
  fill(7, 12, 10, 12, 'W');
  fill(8, 13, 9, 22, 'W');
  fill(3, 13, 4, 21, 'J');
  fill(3, 22, 4, 22, 'f');
  // Trousers, legs apart, boots.
  fill(5, 23, 12, 27, 'P');
  fill(5, 28, 7, 34, 'P');
  fill(10, 28, 12, 34, 'P');
  fill(4, 35, 7, 36, 'B');
  fill(10, 35, 13, 36, 'B');
  // The right arm up to the pole, the hand holding it.
  for (const [x, y] of [
    [13, 13],
    [13, 12],
    [14, 11],
    [14, 10],
    [15, 9],
    [15, 8],
  ] as const) {
    fill(x, y, x + 1, y, 'J');
  }
  fill(16, 6, 16, 7, 'f');
  fill(17, 1, 17, 10, 'p');
  // The flag: 2-pixel squares, waving (each column lifted by a wave along it).
  for (let x = 18; x < MARSHAL_WIDTH; x++) {
    const lift = Math.round(1.5 * Math.sin((x - 18) / 2.5 + phase) * ((x - 17) / 10));
    for (let y = 0; y < 8; y++) {
      const row = y + 2 + lift;
      if (row < 0 || row >= MARSHAL_HEIGHT) continue;
      grid[row]![x] = (Math.floor((x - 18) / 2) + Math.floor(y / 2)) % 2 === 0 ? 'K' : 'w';
    }
  }
  return grid.map((row) => row.join(''));
}

/** The two frames, swapped while she waves. */
export const MARSHAL_FRAMES: readonly (readonly string[])[] = [
  marshalFrame(0),
  marshalFrame(Math.PI),
];
