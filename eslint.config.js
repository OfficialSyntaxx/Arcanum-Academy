import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Lint rules chosen for a long-lived codebase, not for style policing.
 * Formatting is Prettier's job; these rules exist to catch correctness and
 * architecture problems.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/*.tsbuildinfo', 'packages/client/dev-dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // The simulation must stay deterministic: no wall clock, no ambient randomness.
    files: ['packages/sim/src/**/*.ts'],
    ignores: ['packages/sim/src/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'The simulation must not read the wall clock. Use the tick.',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'The simulation must not use Math.random. Use the injected Rng.',
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Build and tooling scripts, whether repo-wide or owned by one package.
    // They run in Node directly rather than being bundled, so Node globals are
    // available and printing to stdout is the point rather than a mistake.
    files: ['tools/**/*.mjs', 'packages/*/scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
);
