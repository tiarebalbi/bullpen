import { expect, test, type Page } from "@playwright/test";

// The stock route is mocked at the browser network layer: no database is touched.
async function mockRoutes(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route("**/api/stock-prices", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
  await page.route("**/api/leaderboard", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null }) }),
  );
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "off" }) }));
}

const rows = [
  { symbol: "AAPL", price: "190.12", asOf: "2026-10-13T20:00:00.000Z", stale: false },
  { symbol: "MSFT", price: "410.5", asOf: "2026-10-08T20:00:00.000Z", stale: true },
];

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`stock prices at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("shows each close with its date, labels the stale one, and credits the source", async ({ page }) => {
      await mockRoutes(page, { rows });
      await page.goto("/");

      const section = page.getByRole("region", { name: "Stock prices" });
      await expect(section.getByRole("listitem")).toHaveCount(2);
      await expect(section.getByText("AAPL", { exact: true }).last()).toBeVisible();
      await expect(section.getByText(/stale · as of Oct 8/)).toHaveCount(1);
      await expect(section.getByRole("link", { name: "Alpha Vantage" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    test("shows the empty state before the first close", async ({ page }) => {
      await mockRoutes(page, { rows: [] });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Stock prices" }).getByText("No end-of-day prices yet")).toBeVisible();
    });
  });
}
