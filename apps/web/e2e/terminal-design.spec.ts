import { expect, test, type Page } from "@playwright/test";
import { mockHeavyTerminal } from "./terminalFixture.js";

// The terminal against its design (design/export-2026-09-25-final, screenshots/term-live.jpg), with a long order history: open orders first, at most five finished
// ones as single lines, a "Show all (N)" for the rest, the leaderboard in the first screen at 1440x900, one line per fill with no wrapping, and one sub-line per
// watchlist row at one height. /api/orders, the prices and the leaderboard are answered at the browser network layer with the fixture in terminalFixture.ts.
const FINISHED = 12; // the fixture has 14 orders, two of them open

async function open(page: Page): Promise<void> {
  await mockHeavyTerminal(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Positions" })).toBeVisible();
}
const orders = (page: Page) => page.getByRole("list", { name: "Your orders" });

for (const viewport of [
  { label: "1440x900", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
]) {
  test.describe(`The terminal's order history at ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("open orders come first, then at most five finished ones, each on one line", async ({ page }) => {
      await open(page);
      const items = orders(page).getByRole("listitem");
      // two open (AAPL working, MSFT partly filled), then five finished
      await expect(items).toHaveCount(7);
      await expect(items.nth(0)).toContainText("AAPL");
      await expect(items.nth(0)).toContainText("Working");
      await expect(items.nth(1)).toContainText("MSFT");
      await expect(items.nth(1)).toContainText("Partially filled");
      for (let i = 2; i < 7; i += 1) {
        const row = items.nth(i);
        await expect(row.getByRole("button")).toHaveCount(0);
        const box = await row.boundingBox();
        expect(box!.height, `finished row ${i} is one line`).toBeLessThan(52);
        const overflow = await row.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(overflow, `finished row ${i} fits its width`).toBe(false);
        // the summary gives way with an ellipsis rather than wrapping, so it is checked itself: nothing is cut off
        const summaryCut = await row.locator(".bp-order__summary").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(summaryCut, `finished row ${i}'s summary is not cut off`).toBe(false);
      }
      await expect(items.nth(2)).toContainText("GOOGL");
      await expect(items.nth(2)).toContainText("Buy 200");
      await expect(items.nth(2)).toContainText("Filled");
    });

    test("'Show all (N)' opens the rest of the history and 'Show fewer' folds it", async ({ page }) => {
      await open(page);
      const toggle = page.getByRole("button", { name: `Show all (${FINISHED})` });
      await expect(toggle).toBeVisible();
      const box = await toggle.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await toggle.click();
      await expect(orders(page).getByRole("listitem")).toHaveCount(2 + FINISHED);
      await page.getByRole("button", { name: "Show fewer" }).click();
      await expect(orders(page).getByRole("listitem")).toHaveCount(7);
    });

    test("the page does not scroll sideways", async ({ page }) => {
      await open(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

test.describe("At 1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the leaderboard's heading is in the first screen, beside the orders, not below the history", async ({ page }) => {
    await open(page);
    const heading = await page.getByRole("heading", { name: "Leaderboard" }).boundingBox();
    const ordersHeading = await page.getByRole("heading", { name: "Orders" }).boundingBox();
    expect(heading!.y + heading!.height, "the leaderboard heading ends inside the first 900px").toBeLessThanOrEqual(900);
    expect(Math.abs(heading!.y - ordersHeading!.y), "level with the orders").toBeLessThan(8);
  });

  test("with the whole history open the leaderboard is still beside it, not pushed below", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /Show all/ }).click();
    const heading = await page.getByRole("heading", { name: "Leaderboard" }).boundingBox();
    expect(heading!.y + heading!.height).toBeLessThanOrEqual(900);
  });
});

for (const viewport of [
  { label: "1440", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
]) {
  test.describe(`Recent fills and the watchlist at ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("each fill is `time Buy 20 AAPL @ 236.10` on one line, the stored quantity is shown as stored, and nothing is cut", async ({ page }) => {
      await open(page);
      const fills = page.getByRole("list", { name: "Recent fills" }).getByRole("listitem");
      await expect(fills).toHaveCount(10);
      await expect(fills.first()).toContainText(/\d\d:\d\d:\d\d\s*Buy 20 AAPL\s*@ 236\.10/);
      const lines = await fills.evaluateAll((items) =>
        items.map((li) => {
          const what = li.querySelector<HTMLElement>(".bp-fills__what")!;
          const rect = li.getBoundingClientRect();
          return { text: li.textContent ?? "", height: rect.height, fits: li.scrollWidth <= li.clientWidth + 1, whatCut: what.scrollWidth > what.clientWidth + 1 };
        }),
      );
      for (const line of lines) {
        // nothing is ever cut or wider than its row
        expect(line.fits, `${line.text} fits`).toBe(true);
        expect(line.whatCut, `${line.text} is not cut off`).toBe(false);
        // a line is one line, except a stock fill booked with a fraction, whose whole quantity is shown and whose price then sits on the next line
        const fraction = /\d+\.\d{4,}\s*GOOGL/.test(line.text);
        if (!fraction) expect(line.height, `${line.text} is one line`).toBeLessThan(26);
      }
      const texts = lines.map((l) => l.text);
      expect(texts.some((t) => /Buy 0\.25 BTC\s*@ 108,900\.00/.test(t))).toBe(true); // crypto: its own decimals
      // a fraction that was booked is shown as booked, never rounded to a whole share
      expect(texts.some((t) => /Buy 116\.83359884 GOOGL/.test(t))).toBe(true);
      expect(texts.some((t) => /Buy 83\.16640116 GOOGL/.test(t))).toBe(true);
      expect(texts.join(" ")).not.toMatch(/Buy 117 GOOGL|Buy 83 GOOGL/);
    });

    test("every watchlist row has one height and one sub-line; a held position says '30 held' and keeps the date in its tooltip and name", async ({ page }) => {
      await open(page);
      const rows = page.locator(".bp-watchlist__row");
      const heights = await rows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThanOrEqual(6);
      expect(new Set(heights).size, `row heights ${heights.join(", ")}`).toBe(1);
      const subLines = await rows.evaluateAll((els) => els.map((el) => el.querySelectorAll(".bp-watchlist__detail").length));
      expect(subLines.every((n) => n === 1)).toBe(true);
      const googl = page.getByRole("button", { name: /GOOGL.*225 held.*198\.10.*Close · Oct 19$/ });
      await expect(googl).toBeVisible();
      await expect(googl.locator(".bp-watchlist__detail")).toHaveText("225 held");
      await expect(googl).toHaveAttribute("title", "GOOGL: Close · Oct 19");
      const msft = rows.filter({ hasText: "MSFT" });
      await expect(msft.locator(".bp-watchlist__detail")).toHaveText("Close · Oct 19");
    });
  });
}
