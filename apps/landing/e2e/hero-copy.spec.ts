import { expect, test, type Page } from "@playwright/test";

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

  test("every U.S. stock mention says end of day, and none promises a part that has shipped", async ({ page }) => {
    const text = await page.locator("body").innerText();
    const mentions = [...text.matchAll(/[^.\n]*\bU\.S\. stock[^.\n]*\./gi)].map((match) => match[0].trim());
    // The hero lede, the hero note and the footer all say it; a mention that drops out should fail, not pass quietly.
    expect(mentions.length).toBeGreaterThanOrEqual(3);
    for (const mention of mentions) {
      expect(mention, mention).toMatch(/end[- ]of[- ]day/i);
      expect(mention, mention).not.toMatch(/\b(arrive|from|opens)\b[^.]*\bPart\s*[123]\b/i);
    }
  });

  test("the hero and nav buttons say 'See the six-part plan' and link to the series", async ({ page }) => {
    for (const scope of [".bp-hero__ctas", ".bp-nav"]) {
      const button = page.locator(scope).getByRole("link", { name: "See the six-part plan" });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute("href", "#series");
    }
  });

  test("the hero says orders are open and links to the trading app, not on a button", async ({ page }) => {
    const hero = page.locator(".bp-hero");
    await expect(hero).toContainText("Orders are open in the trading app");
    await expect(hero.getByRole("link", { name: "trading app" })).toHaveAttribute("href", "https://bullpen-app.tiarebalbi.com");
    await expect(hero).not.toContainText("Accounts and orders arrive in Part 4");
    await expect(hero).not.toContainText("no one is on it yet");
    await expect(hero).not.toContainText("the league opens in Part 3");
    await expect(page.locator(".bp-hero__ctas")).not.toContainText("League opens");
    await expect(page.locator(".bp-nav")).not.toContainText("League opens");
  });

  test("no 'Part N' on the page promises something for a part that has already shipped", async ({ page }) => {
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/\b(arrive|arrives|opens|from)\s+in\s+Part\s*[123]\b/i);
    expect(text).not.toMatch(/\bfrom Part\s*[123]\b/i);
  });
});
