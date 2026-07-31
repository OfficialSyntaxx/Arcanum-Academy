import { defineConfig } from 'vitest/config';

/**
 * One test runner for every package. Vitest resolves workspace packages through
 * npm's symlinks, so tests import `@arcanum/shared` exactly as production code
 * does - no path aliases that only exist in tests.
 */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/__tests__/**'],
    },
  },
});
