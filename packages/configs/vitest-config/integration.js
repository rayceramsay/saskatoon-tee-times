import { defineConfig } from 'vitest/config';

/**
 * A shared Vitest configuration for integration tests.
 *
 * @type {import('vitest/config').ViteUserConfig}
 */
export const integrationConfig = defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    passWithNoTests: true,
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
