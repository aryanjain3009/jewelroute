import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E for the critical flows. Runs against an already-running stack (scripts/run-local.sh):
 *   E2E_WEB (default http://localhost:3000), E2E_API (default http://localhost:4000).
 * Specs reseed the demo tenant through the API (x-cron-secret from apps/api/.env or CRON_SECRET),
 * so run them serially and never against a database you care about.
 *   pnpm --filter @jewelroute/web e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_WEB ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "field", testMatch: /(^|\/)((field|auth)[^/]*|public)\.spec\.ts$/, use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "admin", testMatch: /(^|\/)(admin|manager)[^/]*\.spec\.ts$/, use: { viewport: { width: 1440, height: 900 } } },
    // Public landing page: needs only the web app (no API, no reseed).
    { name: "landing", testMatch: /(^|\/)landing\.spec\.ts$/, use: { viewport: { width: 1440, height: 900 } } },
  ],
});
