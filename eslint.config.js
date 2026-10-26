import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // Allow intentionally unused parameters when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The shared package is the Model: it must stay free of rendering and DOM code
    // so the future server can run the exact same simulation.
    files: ['01_packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', '@altf1/client'] }],
    },
  },
  {
    // The server runs the shared Model under Node: no rendering, no client code.
    files: ['01_packages/server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', '@altf1/client'] }],
    },
  },
  // Singleplayer and multiplayer never mix (01_docs/multiplayer.md): neither mode imports the
  // other, and the building blocks they share import neither. Only main.ts loads them.
  {
    files: ['01_packages/client/src/singleplayer/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: modeImports('multiplayer') }],
    },
  },
  {
    files: ['01_packages/client/src/multiplayer/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: modeImports('singleplayer') }],
    },
  },
  {
    files: ['01_packages/client/src/{core,controller,dev,view}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...modeImports('singleplayer'), ...modeImports('multiplayer')] },
      ],
    },
  },
);

/** Import patterns that reach into the client's `folder` (a game mode). */
function modeImports(folder) {
  return [`**/${folder}`, `**/${folder}/**`];
}
