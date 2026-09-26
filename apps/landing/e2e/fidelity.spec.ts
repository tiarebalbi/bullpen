import { expect, test, type Page } from "@playwright/test";

// Every test mocks the "Live prices" strip's cross-origin fetch to
// apps/web's route -- never a real network dependency, and avoids
// depending on whatever apps/web happens to be deployed right now.
async function mockPriceRoute(page: Page, body: unknown, status = 200): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

const LIVE_QUOTE = {
  symbol: "BTC-USD",
  price: 65432.1,
  changePercent: 2.34,
  time: new Date().toISOString(),
  source: "coingecko",
  fetchedAt: new Date().toISOString(),
};

test.describe("landing fidelity at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 1200 } });

  test("header order is brand, nav links, then the CTA on the right", async ({ page }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    const order = await page.locator(".bp-nav > *").evaluateAll((els) =>
      els
        .filter((el) => getComputedStyle(el).display !== "none")
        .map((el) => el.className || el.tagName),
    );
    // brand, links, spacer, theme toggle, CTA (mobile menu button hidden at desktop).
    expect(order[0]).toContain("bp-nav__brand");
    expect(order[1]).toContain("bp-nav__links");
    expect(order[order.length - 1]).toContain("bp-nav__cta");
  });

  test("header and hero left edges line up (one container)", async ({ page }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    const navLeft = await page.locator(".bp-nav__brand").evaluate((el) => el.getBoundingClientRect().left);
    const heroLeft = await page.locator(".bp-hero__copy, .bp-hero > *").first().evaluate((el) => el.getBoundingClientRect().left);
    expect(Math.abs(navLeft - heroLeft)).toBeLessThan(1);
  });

  test("the empty-state card has no nested border and no mention of Coinbase", async ({ page }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    const emptyState = page.locator(".bp-empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).not.toContainText("Coinbase");
    await expect(emptyState).not.toContainText("blocked");

    // No second bordered wrapper around it: its parent shouldn't itself
    // carry a border/background (the double-card bug this fixed).
    const parentStyle = await emptyState.evaluate((el) => {
      const parent = el.parentElement as HTMLElement;
      const cs = getComputedStyle(parent);
      return { border: cs.borderStyle, background: cs.backgroundColor };
    });
    expect(parentStyle.border === "none" || parentStyle.border === "").toBeTruthy();
  });

  test("the strip shows the live quote and the CoinGecko credit", async ({ page }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    await expect(page.locator(".bp-market-strip").getByText("Live prices", { exact: true })).toBeVisible();
    await expect(page.getByTestId("market-strip-quote")).toBeVisible();
    const credit = page.getByRole("link", { name: "Powered by CoinGecko" });
    await expect(credit).toBeVisible();
    await expect(credit).toHaveAttribute("href", "https://www.coingecko.com/en/api");
  });

  test("the strip shows a labeled error state when the route fails, not a fabricated price", async ({
    page,
  }) => {
    await mockPriceRoute(page, { error: "Price unavailable." }, 503);
    await page.goto("/");

    await expect(page.getByTestId("market-strip-error")).toContainText("Price unavailable.");
    await expect(page.getByTestId("market-strip-quote")).toHaveCount(0);
  });

  test("the strip shows a loading placeholder before the route responds", async ({ page }) => {
    await page.route("**/api/price/BTC-USD", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LIVE_QUOTE) });
    });
    await page.goto("/");

    await expect(page.getByTestId("market-strip-loading")).toBeVisible();
    await expect(page.getByTestId("market-strip-quote")).toHaveCount(0);
  });

  test("the strip labels the quote stale once it's more than 10 minutes old", async ({ page }) => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await mockPriceRoute(page, { ...LIVE_QUOTE, time: elevenMinutesAgo });
    await page.goto("/");

    await expect(page.getByTestId("market-strip-time")).toContainText("stale", { ignoreCase: true });
  });

  test("six series cards render in one row", async ({ page }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    const cards = page.locator(".bp-series-grid > li");
    await expect(cards).toHaveCount(6);

    const tops = await cards.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });
});

test.describe("landing fidelity at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the touched sections (nav, hero, strip, series, architecture) don't cause horizontal overflow", async ({
    page,
  }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    const vw = 390;
    for (const selector of [".bp-nav", ".bp-hero", ".bp-market-strip", "#series", "#architecture"]) {
      const right = await page.locator(selector).evaluate((el) => el.getBoundingClientRect().right);
      expect(right, `${selector} right edge`).toBeLessThanOrEqual(vw + 1);
    }
  });

  test("series cards scroll horizontally within their own container", async ({ page }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    const grid = page.locator(".bp-series-grid");
    const overflowX = await grid.evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe("auto");
    const cardCount = await page.locator(".bp-series-grid > li").count();
    expect(cardCount).toBe(6);
  });

  test("theme toggle and menu button are visible in the mobile header, no CTA", async ({ page }) => {
    await mockPriceRoute(page, LIVE_QUOTE);
    await page.goto("/");

    await expect(page.locator(".bp-nav .bp-theme-toggle")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.locator(".bp-nav .bp-nav__cta")).toBeHidden();
  });
});
