import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for StrinoBans.
 *
 * These tests run against an already-running dev server (Next refuses a second
 * dev server on the same project dir). Start it first with `npm run dev` and note
 * the port — by default Next picks 3000, falling back to 3001 if taken. Point the
 * tests at it with PW_BASE_URL if it isn't on 3001, e.g.:
 *
 *   PW_BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Runs headed by default (set CI=1 for headless). The suite forces the webrtc
 * transport via localStorage so two same-origin tabs sync over BroadcastChannel
 * with no signaling server — deterministic and offline-friendly.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:3001',
    headless: !!process.env.CI,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
