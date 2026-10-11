import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const adrDir = join(import.meta.dirname, "..", "..", "..", "architecture", "adr");

/** The part ADR-0008 says U.S. stock prices belong to, read from its "## Part" section. */
function stockPartFromAdr(): number {
  const file = readFileSync(join(adrDir, "0008-alpha-vantage-stock-prices.md"), "utf8");
  const section = /^##\s+Part\s*\n+\s*(\d+)/m.exec(file);
  if (!section?.[1]) throw new Error("ADR-0008 has no numeric ## Part section");
  return Number(section[1]);
}

async function mockPrice(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ symbol: "BTC-USD", price: 65432.1, changePercent: 2.34, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }),
    }),
  );
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("landing hero copy", () => {
  test.beforeEach(async ({ page }) => {
    await mockPrice(page);
    await page.goto("/");
  });

  test("the hero eyebrow names no part number", async ({ page }) => {
    const eyebrow = page.locator(".bp-hero .bp-eyebrow");
    await expect(eyebrow).toHaveText("A six-part architecture build log");
    await expect(eyebrow).not.toContainText(/part\s*\d/i);
  });

  test("every U.S. stock timing mention names the part ADR-0008 puts stocks in", async ({ page }) => {
    const expected = stockPartFromAdr();
    const text = await page.locator("body").innerText();
    const mentions = [...text.matchAll(/U\.S\. stocks[^.]*?\bPart\s*(\d+)/gi)];
    // The hero lede and the footer both say it; a mention that drops out should fail, not pass quietly.
    expect(mentions.length).toBeGreaterThanOrEqual(2);
    for (const mention of mentions) expect(Number(mention[1]), mention[0]).toBe(expected);
    // No stock mention may exist without a part beside it.
    const stockMentions = text.match(/U\.S\. stocks/gi) ?? [];
    expect(stockMentions.length).toBe(mentions.length);
  });

  test("the hero and nav buttons say 'See the six-part plan' and link to the series", async ({ page }) => {
    for (const scope of [".bp-hero__ctas", ".bp-nav"]) {
      const button = page.locator(scope).getByRole("link", { name: "See the six-part plan" });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute("href", "#series");
    }
  });

  test("the league-opening status line stays under the hero, not on a button", async ({ page }) => {
    await expect(page.locator(".bp-hero")).toContainText("the league opens in Part 3");
    await expect(page.locator(".bp-hero__ctas")).not.toContainText("League opens");
    await expect(page.locator(".bp-nav")).not.toContainText("League opens");
  });
});
