// ESLint here only enforces semicolons (oxlint does the code checks):
// statements and type members always end with one, so automatic semicolon
// insertion can never join two lines. `npx eslint --fix .` adds them.

import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

// oxlint runs the React hooks rules; the code's `eslint-disable` comments
// name them. ESLint only needs the names to exist, so they do nothing here.
const reactHooksForOxlint = { rules: { 'exhaustive-deps': { create: () => ({}) } } };

export default [
  {
    ignores: ['dist/', 'android/', 'release/', 'test-results/', 'playwright-report/', '.cache/', 'node_modules/'],
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@stylistic': stylistic, 'react-hooks': reactHooksForOxlint },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@stylistic/semi': ['error', 'always'],
      // At the end of a line, never `;(...)` at the start of the next.
      '@stylistic/semi-style': ['error', 'last'],
      '@stylistic/no-extra-semi': 'error',
      // Interfaces and type literals: `;` after each member; on one line,
      // none after the last (`{ x: number; y: number }`).
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'semi', requireLast: true },
        singleline: { delimiter: 'semi', requireLast: false },
      }],
    },
  },
];
