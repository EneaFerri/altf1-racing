import * as THREE from 'three';

type Draw = (ctx: CanvasRenderingContext2D, size: number) => void;

/**
 * Builds a tiny procedural texture with nearest-neighbour magnification so every texel
 * renders as a crisp square: the Krunker-style pixel look.
 * `repeat` textures (large surfaces like the ground) also get mipmaps, otherwise they shimmer in the distance.
 * Square unless `height` is given.
 */
function createPixelTexture(
  size: number,
  draw: Draw,
  repeat = false,
  height = size,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  draw(ctx, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
  } else {
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  return texture;
}

/** 4×4 checkerboard of two colours. */
export function createCheckerTexture(size: number, colorA: string, colorB: string): THREE.Texture {
  return createPixelTexture(size, (ctx) => {
    const cell = size / 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  });
}

/** Grass tile with per-pixel colour noise and a darker border, so tiles read as a grid. */
export function createGroundTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#4f9a3a', '#56a540', '#4a9136'], 1);
      ctx.fillStyle = '#3e7d2e';
      ctx.fillRect(0, 0, size, 1);
      ctx.fillRect(0, 0, 1, size);
    },
    true,
  );
}

/** Body colour and the darker pixels sprinkled on it. */
export interface Livery {
  readonly body: string;
  readonly shade: string;
}

/** Car liveries: the local player is red, the bot blue, anything else (dev dummy) grey. */
export const LIVERIES = {
  red: { body: '#e10600', shade: '#b80500' },
  blue: { body: '#1f5fe0', shade: '#1747ad' },
  grey: { body: '#8a8a8a', shade: '#6e6e6e' },
} as const satisfies Record<string, Livery>;

/** Car livery: body colour with a white racing stripe and subtle pixel shading. */
export function createLiveryTexture(livery: Livery, size = 16): THREE.Texture {
  return createPixelTexture(size, (ctx) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = (x + y * 3) % 7 === 0 ? livery.shade : livery.body;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const stripe = Math.floor(size / 2) - 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, stripe, size, 2);
  });
}

/** Seeded noise so procedural textures look the same on every load. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

function fillNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  palette: readonly string[],
  seed: number,
): void {
  const random = seededRandom(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = palette[Math.floor(random() * palette.length)]!;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Asphalt tile, repeated in both directions (edge lines are separate meshes). */
export function createAsphaltTexture(size = 32): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => fillNoise(ctx, size, ['#4a4a4e', '#505055', '#45454a', '#55555a'], 7),
    true,
  );
}

/** Kerb blocks along V: half `colorA`, half `colorB`. One texture repeat = two blocks. */
export function createKerbTexture(colorA: string, colorB: string, size = 8): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      ctx.fillStyle = colorA;
      ctx.fillRect(0, 0, size, size / 2);
      ctx.fillStyle = colorB;
      ctx.fillRect(0, size / 2, size, size / 2);
    },
    true,
  );
}

export function createGravelTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => fillNoise(ctx, size, ['#d9c27a', '#cbb26a', '#e3cf8c', '#bfa560'], 3),
    true,
  );
}

/** Stacked tyres: black with white bands, repeating along the wall. */
export function createTyreWallTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#1b1b1b', '#242424', '#202020'], 11);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 3, size, 2);
      ctx.fillRect(0, 11, size, 2);
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(size / 2 - 1, 0, 1, size);
    },
    true,
  );
}

/**
 * Steering-wheel display: a row of shift lights (green, red, blue) over a dark screen.
 * Shown on a wide rectangle, so each texel becomes a wide block.
 */
export function createWheelDisplayTexture(size = 8): THREE.Texture {
  return createPixelTexture(size, (ctx) => {
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, size, size);
    const lights = ['#2ecc40', '#2ecc40', '#2ecc40', '#ff4136', '#ff4136', '#0074d9'];
    lights.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(1 + i, 1, 1, 2);
    });
  });
}

/** 3×5 pixel glyphs for sector boards (1 = lit). */
const GLYPHS: Record<string, readonly string[]> = {
  S: ['111', '100', '111', '001', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
};

/**
 * Sector board tile (16×8, repeats along the banner): yellow stripes top and bottom, `label`
 * (e.g. "S2") in white pixel glyphs on a dark background.
 */
export function createSectorBoardTexture(label: string): THREE.Texture {
  const width = 16;
  const texture = createPixelTexture(
    width,
    (ctx) => {
      ctx.fillStyle = '#14141c';
      ctx.fillRect(0, 0, width, 8);
      ctx.fillStyle = '#f5c518';
      ctx.fillRect(0, 0, width, 1);
      ctx.fillRect(0, 7, width, 1);
      ctx.fillStyle = '#ffffff';
      const textWidth = label.length * 4 - 1;
      [...label].forEach((char, i) => {
        GLYPHS[char]?.forEach((row, y) => {
          [...row].forEach((bit, x) => {
            if (bit === '1') ctx.fillRect((width - textWidth) / 2 + i * 4 + x, 2 + y, 1, 1);
          });
        });
      });
    },
    false,
    8,
  );
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}
