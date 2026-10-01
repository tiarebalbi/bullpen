import { expect, test } from "@playwright/test";

// Bullpen Landing.dc.html collapses the nav links (and drops the header
// CTA entirely) into a menu button below desktop width -- confirmed
// against the final design export. The export has no coded breakpoint of
// its own; 1180px here is measured from the header's real content (see the
// comment above the Nav component and in landing.css), not a guess.
test.describe("nav at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("collapses the links behind a menu button, which reveals them on click", async ({
    page,
  }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Open menu" });
    const links = page.locator("nav[aria-label='Page sections']");

    await expect(toggle).toBeVisible();
    await expect(links).toBeHidden();

    await toggle.click();

    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
    await expect(links).toBeVisible();
    await expect(links.getByRole("link", { name: "Series" })).toBeVisible();

    // Picking a link closes the menu again.
    await links.getByRole("link", { name: "Series" }).click();
    await expect(links).toBeHidden();
  });

  test("Escape closes the menu and returns focus to the toggle button", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Open menu" });
    const links = page.locator("nav[aria-label='Page sections']");

    await toggle.click();
    await expect(links).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(links).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  });

  test("the header has no CTA, but the hero still shows one", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".bp-nav .bp-nav__cta")).toBeHidden();
    await expect(page.locator(".bp-hero__ctas").getByText("League opens in Part 3")).toBeVisible();
  });
});

test.describe("nav at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shows the full links row and CTA, with no menu button", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
    await expect(page.locator("nav[aria-label='Page sections']")).toBeVisible();
    await expect(page.locator(".bp-nav .bp-nav__cta")).toBeVisible();
  });
});

// The wordmark is the way home, and Home is the first item of the menu, on both pages.
test.describe("Home", () => {
  const priceMock = { symbol: "BTC-USD", price: 65432.1, changePercent: 2.34, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() };
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(priceMock) }));
  });

  test.describe("at 1440px", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the Bullpen wordmark links to the home page", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Bullpen", exact: true })).toHaveAttribute("href", "/");
    });

    test("clicking Bullpen on the architecture page returns to the home page", async ({ page }) => {
      await page.goto("/architecture#rules");
      await page.getByRole("link", { name: "Bullpen", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText("Your spot is open")).toBeVisible();
    });

    test("clicking Bullpen from a section of the home page returns to the top of it", async ({ page }) => {
      await page.goto("/");
      await page.locator("#rules").scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
      await page.getByRole("link", { name: "Bullpen", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
    });

    test("Home is the first menu item: current on the home page, a way back from the architecture page", async ({ page }) => {
      const nav = page.getByRole("navigation", { name: "Page sections" });
      await page.goto("/");
      expect(await nav.getByRole("link").evaluateAll((links) => links.map((link) => link.textContent))).toEqual(["Home", "Series", "Architecture", "Decisions", "Rules", "Cost"]);
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

      await page.goto("/architecture");
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
      await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
      await nav.getByRole("link", { name: "Home" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText("Your spot is open")).toBeVisible();
    });
  });

  test.describe("at 390px", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Home is in the menu, and so is the way back from the architecture page", async ({ page }) => {
      await page.goto("/architecture");
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("navigation", { name: "Page sections" }).getByRole("link", { name: "Home" }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.getByRole("link", { name: "Bullpen", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  });

  // The header never wraps onto a second row: it is one row, or it is the brand and a menu button.
  for (const width of [1100, 1179, 1180, 1200, 1296]) {
    test(`at ${width}px the header is one row, with the links or behind the menu button`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const height = await page.locator(".bp-nav").evaluate((node) => node.getBoundingClientRect().height);
      expect(height, "the header wraps onto a second row").toBeLessThan(100);
      const collapsed = width <= 1180;
      await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible({ visible: collapsed });
      await expect(page.locator(".bp-nav__cta")).toBeVisible({ visible: !collapsed });
    });
  }
});
