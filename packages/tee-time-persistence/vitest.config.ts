import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests spin up docker (local DynamoDB) and run separately via
    // `pnpm test:integration`, keeping the default unit run fast and docker-free.
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
    passWithNoTests: true,
  },
});
