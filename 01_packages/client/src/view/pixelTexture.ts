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

// ---- Kruncar theme (Krunker-style): see 01_docs/themes.md ----

/** Light grey asphalt with sparse darker and lighter specks, like Krunker's tracks. */
export function createSpeckledAsphaltTexture(size = 32): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      ctx.fillStyle = '#7c7c80';
      ctx.fillRect(0, 0, size, size);
      sprinkle(ctx, size, '#66666b', 0.025, 5);
      sprinkle(ctx, size, '#8a8a8f', 0.02, 9);
    },
    true,
  );
}

/** Bright lime grass with blocky darker patches. */
export function createLimeGrassTexture(size = 32): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#8bbd45', '#86b842', '#8fc149'], 13);
      const random = seededRandom(17);
      for (let k = 0; k < 7; k++) {
        const x = Math.floor(random() * size);
        const y = Math.floor(random() * size);
        ctx.fillStyle = k % 2 === 0 ? '#6f9e35' : '#9ccb55';
        // Small L-shaped blots, like Krunker's grass.
        ctx.fillRect(x, y, 3, 1);
        ctx.fillRect(x, y, 1, 2);
      }
    },
    true,
  );
}

/** Two brown rails and a post on transparent pixels (use with `alphaTest`): a wooden fence tile. */
export function createWoodFenceTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#6b4a2f';
      ctx.fillRect(0, 3, size, 3);
      ctx.fillRect(0, 9, size, 3);
      ctx.fillStyle = '#7c5838';
      ctx.fillRect(0, 3, size, 1);
      ctx.fillRect(0, 9, size, 1);
      ctx.fillStyle = '#3f2a1a';
      ctx.fillRect(0, 1, 2, size - 1);
    },
    true,
  );
}

/** Grey concrete wall: plain blocks with a darker seam. */
export function createConcreteTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#9c9ca2', '#a3a3a9', '#97979d'], 19);
      ctx.fillStyle = '#7a7a80';
      ctx.fillRect(0, 0, 1, size);
      ctx.fillRect(0, size - 2, size, 2);
    },
    true,
  );
}

/** Chain-link fence: dark diamond mesh on transparent pixels (use with `alphaTest`). */
export function createChainFenceTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#3a3a40';
      for (let i = 0; i < size; i++) {
        ctx.fillRect(i, i % 8, 1, 1);
        ctx.fillRect(i, 7 - (i % 8), 1, 1);
        ctx.fillRect(i, 8 + (i % 8), 1, 1);
        ctx.fillRect(i, 15 - (i % 8), 1, 1);
      }
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(0, 0, size, 1);
      ctx.fillRect(0, 0, 1, size);
    },
    true,
  );
}

/** Wooden planks across the deck (V runs along the track): light and dark boards. */
export function createPlankTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      const boards = ['#8a6a48', '#7a5c3d', '#937252', '#6f5236'];
      for (let y = 0; y < size; y += 2) {
        ctx.fillStyle = boards[(y / 2) % boards.length]!;
        ctx.fillRect(0, y, size, 2);
      }
      sprinkle(ctx, size, '#5a412b', 0.04, 23);
    },
    true,
  );
}

/** Dark teal water with a few lighter ripples. */
export function createWaterTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#2f5a63', '#2b545c', '#33606a'], 29);
      sprinkle(ctx, size, '#4d7d86', 0.03, 31);
    },
    true,
  );
}

/** Corner warning board: white chevrons pointing right on red (mirror it for left turns). */
export function createChevronTexture(): THREE.Texture {
  const width = 16;
  return createPixelTexture(
    width,
    (ctx) => {
      ctx.fillStyle = '#c8282a';
      ctx.fillRect(0, 0, width, 8);
      ctx.fillStyle = '#f4f4f4';
      for (const start of [1, 6, 11]) {
        for (let y = 0; y < 8; y++) {
          const x = start + (y < 4 ? y : 7 - y);
          ctx.fillRect(x, y, 2, 1);
        }
      }
    },
    false,
    8,
  );
}

/** Grandstand seats with a pixel crowd: rows of red seats and people in assorted colours. */
export function createCrowdTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      ctx.fillStyle = '#8e2b2e';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#b13a3c';
      for (let y = 0; y < size; y += 4) ctx.fillRect(0, y, size, 1);
      const random = seededRandom(37);
      const shirts = ['#e8836b', '#6cc1c9', '#f1c27d', '#9e6bd1', '#d9d9d9', '#4f7fd6'];
      for (let k = 0; k < 14; k++) {
        const x = Math.floor(random() * size);
        const y = 1 + 4 * Math.floor(random() * 4);
        ctx.fillStyle = shirts[k % shirts.length]!;
        ctx.fillRect(x, y, 1, 2);
        ctx.fillStyle = '#e0b48c';
        ctx.fillRect(x, y - 1, 1, 1);
      }
    },
    true,
  );
}

/** Grandstand roof: white with grey stripes. */
export function createRoofTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#c9c9cc';
      for (let x = 0; x < size; x += 3) ctx.fillRect(x, 0, 1, size);
    },
    true,
  );
}

/** Weathered vertical wood boards (barn walls). */
export function createBarnWallTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      const boards = ['#6e5338', '#5f4630', '#765a3d'];
      for (let x = 0; x < size; x += 2) {
        ctx.fillStyle = boards[(x / 2) % boards.length]!;
        ctx.fillRect(x, 0, 2, size);
      }
      sprinkle(ctx, size, '#4a3624', 0.05, 41);
    },
    true,
  );
}

/** Hay bale: straw yellow with darker stalks. */
export function createHayTexture(size = 8): THREE.Texture {
  return createPixelTexture(size, (ctx) => {
    fillNoise(ctx, size, ['#e2c97a', '#d8bd6c', '#ead38a'], 43);
    ctx.fillStyle = '#b89a50';
    ctx.fillRect(0, size / 2, size, 1);
  });
}

/** Hot-air balloon envelope: vertical stripes of `color` and white. */
export function createBalloonTexture(color: string, size = 8): THREE.Texture {
  return createPixelTexture(size, (ctx) => {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = x % 2 === 0 ? color : '#f4f4f8';
      ctx.fillRect(x, 0, 1, size);
    }
  });
}

/** Park grass (Monza): deep green with mown stripes, so the long straights read speed. */
export function createParkGrassTexture(size = 32): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#4c8a36', '#518f3a', '#478432'], 37);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#6aa64a';
      ctx.fillRect(0, 0, size, size / 2);
      ctx.globalAlpha = 1;
      sprinkle(ctx, size, '#3c7029', 0.03, 41);
    },
    true,
  );
}

/** Dry Mediterranean grass (Barcelona): straw and olive tones with bare ochre earth showing. */
export function createDryGrassTexture(size = 32): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#a9a35c', '#b3aa63', '#9e9a55'], 53);
      sprinkle(ctx, size, '#c2a46a', 0.06, 59);
      sprinkle(ctx, size, '#7f8446', 0.04, 61);
    },
    true,
  );
}

/**
 * Guard rail (armco) on transparent pixels (use with `alphaTest`): a steel double-wave beam with
 * a dark post at the tile's left edge.
 */
export function createArmcoTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#3d3d42';
      ctx.fillRect(0, 4, 2, size - 4);
      ctx.fillStyle = '#a9adb3';
      ctx.fillRect(0, 2, size, 6);
      ctx.fillStyle = '#d4d7db';
      ctx.fillRect(0, 3, size, 1);
      ctx.fillRect(0, 6, size, 1);
      ctx.fillStyle = '#7d8187';
      ctx.fillRect(0, 4, size, 1);
      ctx.fillRect(0, 7, size, 1);
    },
    true,
  );
}

/** Pit garage front: grey frame, a dark roller door with slats, a red team stripe on top. */
export function createGarageTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#c9c9cc', '#c2c2c6'], 43);
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(0, 0, size, 2);
      ctx.fillStyle = '#2e2f33';
      ctx.fillRect(2, 5, size - 4, size - 5);
      ctx.fillStyle = '#44464c';
      for (let y = 6; y < size; y += 2) ctx.fillRect(2, y, size - 4, 1);
    },
    true,
  );
}

/** Scatters single pixels of `color` over roughly `share` of the tile. */
function sprinkle(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  share: number,
  seed: number,
): void {
  const random = seededRandom(seed);
  ctx.fillStyle = color;
  for (let k = 0; k < Math.round(size * size * share); k++) {
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
  }
}

/**
 * Riviera facade, one window bay per floor (repeat it every bay and every floor): a pastel wall,
 * a dark window with a light reflection, shutters either side and a white sill.
 */
export function createFacadeTexture(wall: string, shutter: string, size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, [wall], 71);
      sprinkle(ctx, size, '#00000014', 0.08, 73);
      ctx.fillStyle = shutter;
      ctx.fillRect(2, 4, 2, 8);
      ctx.fillRect(12, 4, 2, 8);
      ctx.fillStyle = '#2d3a46';
      ctx.fillRect(5, 4, 6, 8);
      ctx.fillStyle = '#6f8597';
      ctx.fillRect(5, 4, 2, 3);
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(4, 12, 8, 1);
      ctx.fillStyle = '#00000022';
      ctx.fillRect(0, 15, size, 1);
    },
    true,
  );
}

/** Modern tower (the tall apartment blocks): blue-grey glass in bands, white floor slabs. */
export function createGlassFacadeTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#7f97a8', '#8aa3b4', '#7690a2'], 79);
      ctx.fillStyle = '#a9bfcd';
      ctx.fillRect(0, 3, size, 2);
      ctx.fillStyle = '#e9e9e4';
      ctx.fillRect(0, 13, size, 3);
      ctx.fillStyle = '#5e7383';
      ctx.fillRect(7, 0, 1, 13);
    },
    true,
  );
}

/** Town ground: pale stone paving with darker joints. */
export function createPavingTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#cfc7b6', '#d6cebd', '#c8c0ae'], 83);
      ctx.fillStyle = '#b3aa98';
      for (let i = 0; i < size; i += 8) {
        ctx.fillRect(0, i, size, 1);
        ctx.fillRect(i + (i % 16 === 0 ? 0 : 4), 0, 1, size);
      }
    },
    true,
  );
}

/** Mediterranean sea: deep blue with light glints. */
export function createSeaTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#1d6aa3', '#1a649b', '#2272ab'], 89);
      sprinkle(ctx, size, '#6fb3dd', 0.03, 97);
    },
    true,
  );
}

/** Swimming pool: bright blue with a darker lane line. */
export function createPoolTexture(size = 16): THREE.Texture {
  return createPixelTexture(
    size,
    (ctx) => {
      fillNoise(ctx, size, ['#3fb5e6', '#45bdec', '#3aaedf'], 101);
      ctx.fillStyle = '#1f6f9c';
      ctx.fillRect(7, 0, 2, size);
    },
    true,
  );
}
