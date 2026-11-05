import type { Livery } from '../pixelTexture';

/**
 * A driver standing, front view, one character per pixel: H/h helmet (livery body/shade), V/v
 * visor, k neck, S/s suit, W white stripe, G gloves, B boots, T/t trophy (gold), `.` empty.
 */
const DRIVER = [
  '................',
  '................',
  '................',
  '................',
  '......HHHH......',
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '....HvVVVVVH....',
  '....HVVVVVVH....',
  '....hhhhhhhh....',
  '......kkkk......',
  '...SSSSWWSSSS...',
  '..SSSSSWWSSSSS..',
  '..SS.SSWWSS.SS..',
  '..SS.SSWWSS.SS..',
  '..GG.SSSSSS.GG..',
  '.....ssssss.....',
  '.....SS..SS.....',
  '.....SS..SS.....',
  '.....SS..SS.....',
  '.....BB..BB.....',
  '....BBB..BBB....',
];

/** The same driver with the right arm up, holding the winner's cup. */
const WINNER = [
  '...........TTTTT',
  '............TtT.',
  '.............T..',
  '............TTT.',
  '......HHHH..GG..',
  '.....HHHHHH.SS..',
  '....HHHHHHHHSS..',
  '....HvVVVVVHSS..',
  '....HVVVVVVHSS..',
  '....hhhhhhhhSS..',
  '......kkkk..SS..',
  '...SSSSWWSSSSS..',
  '..SSSSSWWSSSSS..',
  '..SS.SSWWSS.....',
  '..SS.SSWWSS.....',
  '..GG.SSSSSS.....',
  ...DRIVER.slice(16),
];

const FIXED_COLORS: Readonly<Record<string, string>> = {
  V: '#16161c',
  v: '#5a6a80',
  k: '#2a2a30',
  W: '#ffffff',
  G: '#f4f4f6',
  B: '#1a1a1f',
  T: '#f5c518',
  t: '#c79a00',
};

/**
 * A pixel-art driver in `livery` (helmet and suit), holding the cup if `trophy`: a canvas one
 * pixel per sprite pixel, to be scaled up by CSS with `image-rendering: pixelated`.
 */
export function pixelFigure(livery: Livery, trophy: boolean): HTMLCanvasElement {
  const rows = trophy ? WINNER : DRIVER;
  const colors: Record<string, string> = {
    ...FIXED_COLORS,
    H: livery.body,
    S: livery.body,
    h: livery.shade,
    s: livery.shade,
  };
  return paintPixels(rows, colors);
}

/**
 * Pixel art from rows of characters, one per pixel (`colors` per character; others are empty): a
 * canvas one pixel per sprite pixel, to be scaled up crisply (CSS `image-rendering: pixelated`,
 * or a nearest-filtered texture).
 */
export function paintPixels(
  rows: readonly string[],
  colors: Readonly<Record<string, string>>,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0]!.length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      const color = colors[pixel];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return canvas;
}
