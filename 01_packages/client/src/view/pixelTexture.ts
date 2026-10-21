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

export function createCheckerTexture(
  size = 16,
  colorA = '#e10600',
  colorB = '#ffffff',
): THREE.Texture {
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
      // Fixed-seed LCG: the pattern is identical on every load.
      let seed = 1;
      const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const shade = Math.floor(random() * 3);
          ctx.fillStyle = ['#4f9a3a', '#56a540', '#4a9136'][shade]!;
          ctx.fillRect(x, y, 1, 1);
        }
      }
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
