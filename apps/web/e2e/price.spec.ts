import { expect, test, type Page } from "@playwright/test";

// Every test mocks apps/web's own /api/price/BTC-USD route at the browser
// network layer (page.route), so the real Next server handler is never
// invoked -- CoinGecko is never called, in CI or locally.
async function mockPriceRoute(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

const FRESH_SNAPSHOT = {
  symbol: "BTC-USD",
  price: 65432.1,
  changePercent: 2.34,
  time: new Date().toISOString(),
  source: "coingecko",
  fetchedAt: new Date().toISOString(),
};

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`price page at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("shows the price and a visible, linked CoinGecko credit", async ({ page }) => {
      await mockPriceRoute(page, FRESH_SNAPSHOT);
      await page.goto("/");

      await expect(page.getByTestId("price-cell-price")).toHaveText("65,432.10");

      const credit = page.getByRole("link", { name: "Powered by CoinGecko" });
      await expect(credit).toBeVisible();
      await expect(credit).toHaveAttribute("href", "https://www.coingecko.com/en/api");
    });

    test("shows a labeled error state when the route fails, credit still not fabricated", async ({
      page,
    }) => {
      await mockPriceRoute(page, { error: "Market data provider is unavailable." }, 503);
      await page.goto("/");

      // Scoped to the ErrorState card specifically -- Next's own route
      // announcer is also role="alert" and would otherwise match too.
      await expect(page.locator(".bp-error-state")).toContainText("Price unavailable");
      await expect(page.getByText("Market data provider is unavailable.")).toBeVisible();
      // No price fabricated when the upstream call failed.
      await expect(page.getByTestId("price-cell-price")).toHaveCount(0);
    });
  });
}
