import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

// ---------------------------------------------------------------------------
// E2E config. Not part of `npm test` (that is the vitest unit suite).
//
//   npm run test:e2e
//
// Prereqs (see e2e/README.md): Postgres + Redis reachable and migrations
// applied. globalSetup re-seeds the local DB before the run. By default
// Playwright starts `next dev` itself; set PLAYWRIGHT_BASE_URL to reuse a
// server you already have running.
// ---------------------------------------------------------------------------

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const webServer: PlaywrightTestConfig["webServer"] = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : {
      command: "npm run dev",
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(webServer ? { webServer } : {}),
});
