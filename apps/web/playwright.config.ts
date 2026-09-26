import { defineConfig, devices } from "@playwright/test";

const PORT = 4320;

// Runs against the real production build, not `next dev` -- so the smoke
// test exercises exactly what actually ships. The price route itself is
// never hit for real: every test mocks it via page.route(), so this never
// calls CoinGecko, in CI or locally (no COINGECKO_DEMO_API_KEY needed here).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next` directly, not `pnpm exec next` -- the extra pnpm layer put
    // `next-server` outside the process group Playwright tears down after
    // the run, orphaning it (see apps/landing/playwright.config.ts, same fix).
    command: `pnpm run build && next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
