import { defineConfig } from '@playwright/test';

const baseURL = process.env.TEHKARTA_E2E_BASE_URL ?? 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm dev -- --host 127.0.0.1 --port 5174',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
