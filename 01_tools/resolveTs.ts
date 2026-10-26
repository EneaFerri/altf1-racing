/**
 * Lets plain `node` run TypeScript that imports `01_packages/shared`, whose imports have no extension
 * (Vite style): a failed relative import is retried with `.ts`, then `/index.ts`.
 * Loaded with `node --import ./01_tools/resolveTs.ts ...` by the OpenF1 tool (`01_tools/openf1/README.md`)
 * and the multiplayer server (`01_packages/server`).
 */
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('.') || /\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(specifier, context);
    }
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return nextResolve(specifier + suffix, context);
      } catch {
        // try the next suffix
      }
    }
    return nextResolve(specifier, context);
  },
});
