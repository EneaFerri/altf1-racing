/**
 * Lets plain `node` run the tool against `01_packages/shared`, whose imports have no extension
 * (Vite style): a failed relative import is retried with `.ts`, then `/index.ts`.
 * Loaded with `node --import ./01_tools/openf1/resolveTs.ts ...` (see README.md).
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
