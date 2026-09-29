import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests: the real Route Handlers against a real PostgreSQL + PostgREST (see
 * tests-integration/README.md). Not part of `npm test`; run with `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests-integration/**/*.test.ts'],
    globalSetup: ['tests-integration/globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One database: files must not interleave.
    fileParallelism: false,
    env: {
      SECRET_KEY: 'integration-secret-key-0123456789-0123456789',
      APP_URL: 'https://app.test',
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    },
  },
});
