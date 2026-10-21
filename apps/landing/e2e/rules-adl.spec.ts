import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { loadLatestRulesSnapshot } from "../lib/rulesSnapshot.js";
import { ruleSince } from "../lib/rulesView.js";

// The Rules cards show structure.adl as written: the lines verbatim under the # heading they sit
// under, highlighted with the design tokens, with the snapshot's result on each ASSERT, and a
// link that opens the whole file. Read from the files themselves, so nothing here repeats a rule.

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const adlLines = readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8").split("\n");
const snapshot = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"))!;
const snapshotRules = snapshot.checks.flatMap((check) => check.rules);

const HEADINGS = adlLines.filter((line) => line.startsWith("# ")).map((line) => line.slice(2));
const ASSERT_LINES = adlLines.map((raw, index) => ({ raw, number: index + 1 })).filter((line) => line.raw.startsWith("ASSERT("));
const slugOf = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const ruleIdOf = (assertLine: string): string => slugOf(assertLine.slice("ASSERT(".length, -1));

const priceMock = { symbol: "BTC-USD", price: 65432.1, changePercent: 2.34, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() };
async function mockPrice(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(priceMock) }));
}

/** What a line of the file shows on screen, whitespace and all. */
const shown = (locator: Locator): Promise<string[]> => locator.evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));

async function noSidewaysScroll(page: Page, what: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what} scrolls sideways`).toBeLessThanOrEqual(0);
}

for (const viewport of [
  { label: "1440px", width: 1440, height: 1100 },
  { label: "390px", width: 390, height: 844 },
]) {
  test.describe(`Rules cards at ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.describe("on the home page", () => {
      test.beforeEach(async ({ page }) => {
        await mockPrice(page);
        await page.goto("/");
      });

      // The tiles and their panel are checked in rule-tiles.spec.ts; the Rules card keeps a link that opens the whole file.
      test("View structure.adl opens the whole file, highlighted the same way, and Escape closes it", async ({ page }) => {
        await page.locator("#rules").getByRole("link", { name: "View structure.adl" }).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(page).toHaveURL(/#structure-adl$/);

        const lines = await shown(dialog.locator(".bp-adl__line"));
        expect(lines).toEqual(adlLines.slice(0, lines.length));
        expect(lines.length).toBe(adlLines.length - (adlLines[adlLines.length - 1] === "" ? 1 : 0));
        await expect(dialog.locator(".bp-adl__keyword").first()).toBeVisible();
        await expect(dialog.locator(".bp-adl__comment").first()).toHaveText("# Structural assertions");

        const overflow = await dialog.locator(".bp-adl-modal__file").evaluate((node) => node.scrollWidth - node.clientWidth);
        expect(overflow, "the file scrolls sideways inside the modal").toBeLessThanOrEqual(0);
        await noSidewaysScroll(page, "the page with the modal open");

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(page).not.toHaveURL(/#structure-adl/);
      });

      test("the Rules card links to the file, and a deep link to #structure-adl opens it", async ({ page }) => {
        await expect(page.locator("#rules").getByRole("link", { name: "View structure.adl" })).toHaveCount(1);
        await page.goto("/#structure-adl");
        await expect(page.getByRole("dialog")).toBeVisible();
      });

      test("the longest rule wraps inside its row in the open tile, and the page never scrolls sideways", async ({ page }) => {
        await noSidewaysScroll(page, "the home page");
        const longest = ASSERT_LINES.reduce((a, b) => (a.raw.length >= b.raw.length ? a : b));
        const groupOf = (heading: string): string[] => {
          const out: string[] = [];
          for (let i = adlLines.indexOf(`# ${heading}`) + 1; i < adlLines.length && !adlLines[i]!.startsWith("# "); i++) out.push(adlLines[i]!);
          return out;
        };
        const heading = HEADINGS.find((h) => groupOf(h).includes(longest.raw))!;
        await page.locator(".bp-tile", { hasText: heading.replace(/\s*\(.+\)$/, "") }).first().click();
        const row = page.locator(".bp-tile-detail .bp-tile-row__text", { hasText: longest.raw });
        await expect(row).toBeVisible();
        const metrics = await row.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
        await noSidewaysScroll(page, "the home page with the tile open");
      });
    });

    test.describe("on the /architecture Rules tab", () => {
      const panel = (page: Page) => page.getByRole("tabpanel");
      const toPart = async (page: Page, n: number) => {
        await page.getByRole("group", { name: "Series part" }).getByRole("button", { name: `PART ${n}` }).click();
        await expect(page.getByRole("group", { name: "Series part" }).getByRole("button", { name: `PART ${n}` })).toHaveAttribute("aria-current", "step");
      };

      test("shows the same cards and ASSERT lines, verbatim", async ({ page }) => {
        await page.goto("/architecture#rules");
        await toPart(page, 2);
        await expect(panel(page).locator(".bp-rule-card--adl")).toHaveCount(HEADINGS.length);
        const lines = await shown(panel(page).locator(".bp-rule-card--adl .bp-adl__line"));
        expect(lines.filter((line) => line.startsWith("ASSERT("))).toEqual(ASSERT_LINES.map((line) => line.raw));
        expect(lines.filter((line) => line.startsWith("# "))).toEqual(HEADINGS.map((heading) => `# ${heading}`));
      });

      test("lists every ASSERT verbatim in the table, with the check that enforces it and its result", async ({ page }) => {
        await page.goto("/architecture#rules");
        await toPart(page, 2);
        for (const assert of ASSERT_LINES) {
          const id = ruleIdOf(assert.raw);
          const row = panel(page).locator(`tr[data-rule="${id}"]`);
          const result = snapshotRules.find((rule) => rule.id === id)!;
          await expect(row.locator(".bp-adl__line")).toHaveText(assert.raw);
          await expect(row.locator("td").nth(1)).toHaveText(result.check);
          await expect(row.locator(".bp-chip")).toHaveText(result.passed ? "✓ pass" : "✕ fail");
        }
      });

      for (const part of [1, 2]) {
        test(`at Part ${part}, a rule that is not in force yet says "Arrives in Part N", and the header counts only the ones that are`, async ({ page }) => {
          await page.goto("/architecture#rules");
          await toPart(page, part);

          const inForce = snapshotRules.filter((rule) => ruleSince(rule.id, rule.check) <= part);
          const passing = inForce.filter((rule) => rule.passed).length;
          await expect(panel(page).locator(".bp-ap-tabhead__help")).toHaveText(`${passing} of ${inForce.length} rules passing at Part ${part}.`);

          for (const assert of ASSERT_LINES) {
            const id = ruleIdOf(assert.raw);
            const result = snapshotRules.find((rule) => rule.id === id)!;
            const since = ruleSince(id, result.check);
            const expected = since > part ? `Arrives in Part ${since}` : result.passed ? "✓ pass" : "✕ fail";
            await expect(panel(page).locator(`.bp-rule-card .bp-adl__row[data-rule="${id}"] .bp-chip`)).toHaveText(expected);
            await expect(panel(page).locator(`tr[data-rule="${id}"] .bp-chip`)).toHaveText(expected);
          }
          await expect(panel(page).locator(".bp-rule-card .bp-adl__result .bp-chip", { hasText: "Arrives in Part" })).toHaveCount(part === 1 ? ASSERT_LINES.filter((line) => ruleSince(ruleIdOf(line.raw), snapshotRules.find((rule) => rule.id === ruleIdOf(line.raw))!.check) > 1).length : 0);
        });
      }

      test("View structure.adl opens the file in the Rules tab, and closing it leaves you on the Rules tab", async ({ page }) => {
        await page.goto("/architecture#rules");
        await toPart(page, 2);
        await panel(page).getByRole("link", { name: "View structure.adl" }).first().click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(page.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
        const lines = await shown(dialog.locator(".bp-adl__line"));
        expect(lines).toEqual(adlLines.slice(0, lines.length));
        await noSidewaysScroll(page, "the Rules tab with the modal open");

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/architecture#rules$/);
        await expect(page.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
      });

      test("never scrolls sideways", async ({ page }) => {
        await page.goto("/architecture#rules");
        await toPart(page, 2);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "the Rules tab scrolls sideways").toBeLessThanOrEqual(0);
      });
    });
  });
}

// The modal is opened by a link to #structure-adl and closed by putting the hash back. It must open
// again, from the same link, from another modal's, and from the URL: closing once must not use it up.
test.describe("reopening the structure.adl modal", () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  test("opens, closes and opens again from the card's link, as many times as you like", async ({ page }) => {
    await mockPrice(page);
    await page.goto("/");
    const link = page.locator("#rules").getByRole("link", { name: "View structure.adl" }).first();
    const dialog = page.getByRole("dialog");

    for (let time = 1; time <= 3; time++) {
      await link.click();
      await expect(dialog, `opening time ${time}`).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog, `closing time ${time}`).toBeHidden();
    }
  });

  test("opens from the URL, closes, and opens again from a card's link", async ({ page }) => {
    await mockPrice(page);
    await page.goto("/#structure-adl");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.locator("#rules").getByRole("link", { name: "View structure.adl" }).first().click();
    await expect(dialog).toBeVisible();
  });

  test("closes with the backdrop and the close button, and each time opens again", async ({ page }) => {
    await mockPrice(page);
    await page.goto("/");
    const link = page.locator("#rules").getByRole("link", { name: "View structure.adl" }).first();
    const dialog = page.getByRole("dialog");

    await link.click();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    await link.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();

    await link.click();
    await expect(dialog).toBeVisible();
  });

  test("goes from the file to a decision and back, each opening each time", async ({ page }) => {
    await mockPrice(page);
    await page.goto("/");
    const adlLink = page.locator("#rules").getByRole("link", { name: "View structure.adl" }).first();
    const adrRow = page.locator("#decisions .bp-decisions-row", { hasText: "ADR-0002" });
    const dialog = page.getByRole("dialog");

    for (let time = 1; time <= 2; time++) {
      await adlLink.click();
      await expect(dialog.getByRole("heading", { name: "structure.adl" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await adrRow.click();
      await expect(dialog.getByText("ADR-0002", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });

  test("on the Rules tab: opens, closes to #rules, opens again, and the tab stays Rules throughout", async ({ page }) => {
    await page.goto("/architecture#rules");
    const link = page.getByRole("tabpanel").getByRole("link", { name: "View structure.adl" }).first();
    const dialog = page.getByRole("dialog");

    for (let time = 1; time <= 3; time++) {
      await link.click();
      await expect(dialog, `opening time ${time}`).toBeVisible();
      await expect(page.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/architecture#rules$/);
    }
  });

  test("on the Decisions tab: the same decision opens again after it is closed", async ({ page }) => {
    await page.goto("/architecture#decisions");
    const row = page.getByRole("tabpanel").locator(".bp-decisions-row", { hasText: "ADR-0002" });
    const dialog = page.getByRole("dialog");

    for (let time = 1; time <= 2; time++) {
      await row.click();
      await expect(dialog, `opening time ${time}`).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });
});
