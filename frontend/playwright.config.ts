import { defineConfig } from '@playwright/test';

/**
 * Browser tests of the production build against a real PostgreSQL + PostgREST (see e2e/README.md).
 * Not part of `npm test`; run with `npm run test:e2e`.
 */
const port = process.env.E2E_PORT ?? '3111';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // One database: tests must not interleave.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Locally use the installed Chrome (no browser download); CI installs Playwright's Chromium.
    channel: process.env.E2E_CHROME_CHANNEL || undefined,
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `http://localhost:${port}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
