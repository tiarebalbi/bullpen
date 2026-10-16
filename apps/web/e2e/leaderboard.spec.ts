import { expect, test, type Page } from "@playwright/test";

// The leaderboard route is mocked at the browser network layer, so the real
// handler never runs and no database is touched, in CI or locally.
async function mockLeaderboard(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route("**/api/leaderboard", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
  await page.route("**/api/stock-prices", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) }));
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "off" }) }));
}

const row = (rank: number, handle: string, equity: string) => ({ accountId: `id-${rank}`, handle, cash: equity, positionsValue: "0", equity, rank });
const board = (overrides = {}) => ({ rows: [row(1, "ada", "1000"), row(2, "grace", "250.5")], asOf: new Date().toISOString(), ageMs: 15_000, stale: false, lastFailure: null, ...overrides });

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`leaderboard at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("shows the ranking and when it was computed", async ({ page }) => {
      await mockLeaderboard(page, board());
      await page.goto("/");

      const section = page.getByRole("region", { name: "Leaderboard" });
      await expect(section.getByRole("listitem")).toHaveCount(2);
      await expect(section.getByText("ada")).toBeVisible();
      await expect(section.getByText(/as of \d\d:\d\d:\d\d/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    test("labels a stale ranking, and says a failed refresh left the last good one", async ({ page }) => {
      await mockLeaderboard(page, board({ stale: true, ageMs: 9 * 60_000, asOf: new Date(Date.now() - 9 * 60_000).toISOString(), lastFailure: { at: new Date().toISOString(), error: "x" } }));
      await page.goto("/");

      const section = page.getByRole("region", { name: "Leaderboard" });
      await expect(section.getByText("Stale", { exact: true })).toBeVisible();
      await expect(section.getByTestId("leaderboard-refresh-failed")).toContainText("last good ranking");
    });

    test("shows the empty state with no accounts", async ({ page }) => {
      await mockLeaderboard(page, board({ rows: [] }));
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Leaderboard" }).getByText("No players yet")).toBeVisible();
    });
  });
}
