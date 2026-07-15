import { configDefaults, defineConfig } from 'vitest/config';

/**
 * A shared Vitest configuration for unit tests.
 *
 * @type {import('vitest/config').ViteUserConfig}
 */
export const baseConfig = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
    passWithNoTests: true,
  },
});
