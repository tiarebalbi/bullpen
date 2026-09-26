import { expect, test } from "@playwright/test";

// Bullpen Landing.dc.html collapses the nav links into a menu button at
// 390px rather than wrapping them (confirmed against the final design
// export). This test pins that behavior.
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
});
