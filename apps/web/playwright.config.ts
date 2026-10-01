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
    // Every spec but analytics.spec.ts starts as a visitor who already chose
    // (rejected), so the consent banner is not in the way of what they test.
    storageState: {
      cookies: [
        { name: "bullpen_consent", value: "rejected", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
      ],
      origins: [],
    },
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
    // Built as production, with dummy ids, so the tags are allowed to load.
    // analytics.spec.ts answers every request to Google and Clarity itself,
    // so nothing is ever sent to them.
    env: {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-TEST000000",
      NEXT_PUBLIC_CLARITY_PROJECT_ID: "clar1tytest",
    },
  },
});
