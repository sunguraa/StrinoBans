import next from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    // Local scratch/reference code kept out of the build and out of lint.
    ignores: ['.local/**', 'tests/**/.auth/**'],
  },
  ...next,
  prettier,
  {
    rules: {
      // Next.js lint rules that conflict with the project's conventions
      '@next/next/no-html-link-for-pages': 'off',
      // Static export (output: 'export') can't use the next/image optimizer,
      // so plain <img> is intentional throughout.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default config;