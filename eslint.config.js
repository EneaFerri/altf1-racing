import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // The shared package is the Model: it must stay free of rendering and DOM code
    // so the future server can run the exact same simulation.
    files: ['01_packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', '@altf1/client'] }],
    },
  },
);
