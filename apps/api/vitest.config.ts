import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/setup-global.ts'],
    setupFiles: ['test/setup-env.ts', 'test/setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
