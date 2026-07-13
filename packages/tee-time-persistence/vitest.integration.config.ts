import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    passWithNoTests: true,
    // Container startup (and first-run image pull) is well beyond the default.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
