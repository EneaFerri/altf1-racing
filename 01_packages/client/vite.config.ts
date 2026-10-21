import { defineConfig } from 'vite';

export default defineConfig({
  // Keep Vite's dependency cache in the single root node_modules instead of
  // creating a second node_modules folder inside 01_packages/client.
  cacheDir: '../../node_modules/.vite',
  build: {
    // Three.js alone minifies to ~530 kB, above Vite's default 500 kB warning, and can't be
    // split further. 700 kB silences that known case but still warns if our own code bloats.
    chunkSizeWarningLimit: 700,
  },
  server: {
    // Listen on all interfaces so other machines (e.g. over Tailscale) can open the dev build.
    host: true,
  },
});
