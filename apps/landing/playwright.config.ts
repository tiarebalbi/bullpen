import { defineConfig, devices } from "@playwright/test";

const PORT = 4310;

// Runs against the real production build (the CALM diagram generation, the
// check:arch capture, and `next build` itself), not `next dev` — so the
// smoke test exercises exactly what actually ships.
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
    // `next` directly, not `pnpm exec next` — the extra pnpm layer put
    // `next-server` outside the process group Playwright tears down after
    // the run, orphaning it (and leaving it holding the port/stdout open).
    command: `pnpm run build && next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
