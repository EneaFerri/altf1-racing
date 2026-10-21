import { defineConfig } from 'vite';

export default defineConfig({
  // Keep Vite's dependency cache in the single root node_modules instead of
  // creating a second node_modules folder inside 01_packages/client.
  cacheDir: '../../node_modules/.vite',
  server: {
    // Listen on all interfaces so other machines (e.g. over Tailscale) can open the dev build.
    host: true,
  },
});
