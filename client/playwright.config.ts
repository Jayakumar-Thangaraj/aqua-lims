import { defineConfig } from '@playwright/test';

// Runs against a running stack (npm run dev). Uses the installed Microsoft Edge (no browser download).
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'msedge',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
});
