import * as THREE from 'three';

type Draw = (ctx: CanvasRenderingContext2D, size: number) => void;

/**
 * Builds a tiny procedural texture with nearest-neighbour magnification so every texel
 * renders as a crisp square: the Krunker-style pixel look.
 * `repeat` textures (large surfaces like the ground) also get mipmaps, otherwise they shimmer in the distance.
 */
function createPixelTexture(size: number, draw: Draw, repeat = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
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

/** Car livery: red body with a white racing stripe and subtle pixel shading. */
export function createLiveryTexture(size = 16): THREE.Texture {
  return createPixelTexture(size, (ctx) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = (x + y * 3) % 7 === 0 ? '#b80500' : '#e10600';
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
