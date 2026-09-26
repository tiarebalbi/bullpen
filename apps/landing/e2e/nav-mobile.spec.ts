import { expect, test } from "@playwright/test";

// Bullpen Landing.dc.html collapses the nav links (and drops the header
// CTA entirely) into a menu button below desktop width -- confirmed
// against the final design export. The export has no coded breakpoint of
// its own; 900px here is measured from the header's real content (see the
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
