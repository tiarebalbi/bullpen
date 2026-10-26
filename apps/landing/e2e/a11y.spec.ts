import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// axe over what Track A changed (the status grid and the cost cards), in both themes and at both widths, with a tile open.
// Serious and critical findings fail; contrast is one of the rules axe checks, at the WCAG AA 4.5:1 for text.

async function open(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => window.localStorage.setItem("bp-theme", t), theme);
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark).*$/);
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [{ label: "1440px", width: 1440, height: 1200 }, { label: "390px", width: 390, height: 844 }]) {
    test.describe(`axe, ${theme} theme at ${viewport.label}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("the status grid and the cost cards have no violations", async ({ page }) => {
        await open(page, theme);
        await page.locator('.bp-tile[data-tile="adl-allowed-dependencies"]').click();
        await page.locator("#cost details.bp-cost-all summary").click();
        const results = await new AxeBuilder({ page }).include(".bp-status-grid").include(".bp-cost-grid").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
        expect(summary).toEqual([]);
      });

      // axe skips a count of one digit, so a faded count passed until a part had ten decisions (3.88:1 at opacity 0.8, against 4.5:1).
      // The count must not be dimmer than its tab's own text, whatever its digits.
      test("an unselected decisions tab shows its count at full strength, so contrast does not depend on the digits", async ({ page }) => {
        await open(page, theme);
        const counts = page.locator('.bp-decision-tab[aria-selected="false"] .bp-decision-tab__count');
        expect(await counts.count()).toBeGreaterThan(0);
        expect(await counts.evaluateAll((spans) => spans.map((span) => getComputedStyle(span).opacity))).toEqual(Array(await counts.count()).fill("1"));
      });
    });
  }
}
