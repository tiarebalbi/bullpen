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

      test("one card per # heading, in the file's order, then the CALM and budget cards", async ({ page }) => {
        const cards = page.locator("#rules .bp-rule-card");
        await expect(cards).toHaveCount(HEADINGS.length + 2);
        const adlCards = page.locator("#rules .bp-rule-card--adl");
        await expect(adlCards).toHaveCount(HEADINGS.length);
        expect(await adlCards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? node.querySelector("[aria-label]")?.getAttribute("aria-label")))).toEqual(HEADINGS);
        await expect(page.locator("#rules .bp-rule-card").nth(HEADINGS.length)).toContainText("calm validate --strict");
        await expect(page.locator("#rules .bp-rule-card").nth(HEADINGS.length + 1)).toContainText("budget-check.ts");
      });

      test("every card shows its # heading and its ASSERT lines exactly as the file has them, indentation included", async ({ page }) => {
        const lines = await shown(page.locator("#rules .bp-rule-card--adl .bp-adl__line"));
        const expected = HEADINGS.flatMap((heading) => {
          const headingLine = adlLines.findIndex((line) => line === `# ${heading}`);
          const asserts: string[] = [];
          for (let i = headingLine + 1; i < adlLines.length && !adlLines[i]!.startsWith("# "); i++) if (adlLines[i]!.startsWith("ASSERT(")) asserts.push(adlLines[i]!);
          return [`# ${heading}`, ...asserts];
        });
        expect(lines).toEqual(expected);
        expect(lines.filter((line) => line.startsWith("ASSERT("))).toHaveLength(ASSERT_LINES.length);
      });

      test("keywords, names, paths and comments take the design system's tokens", async ({ page }) => {
        const styles = await page.evaluate(() => {
          const card = document.querySelector("#rules .bp-rule-card--adl")!;
          const resolve = (value: string): string => {
            const probe = document.createElement("span");
            probe.style.color = value;
            card.appendChild(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          };
          const of = (selector: string) => {
            const node = document.querySelector(`#rules ${selector}`)!;
            const style = getComputedStyle(node);
            return { color: style.color, fontStyle: style.fontStyle, fontFamily: style.fontFamily, text: node.textContent };
          };
          const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim().split(",")[0]!.replace(/["']/g, "");
          return {
            mono,
            accent: resolve("var(--bp-accent-text)"),
            primary: resolve("var(--foreground)"),
            muted: resolve("var(--foreground-muted)"),
            keyword: of(".bp-adl__keyword"),
            name: of(".bp-adl__name"),
            path: of(".bp-adl__path"),
            comment: of(".bp-adl__comment"),
          };
        });

        expect(styles.keyword.color).toBe(styles.accent);
        expect(styles.name.color).toBe(styles.primary);
        expect(styles.path.color).toBe(styles.muted);
        expect(styles.path.fontFamily).toContain(styles.mono);
        expect(styles.comment.color).toBe(styles.muted);
        expect(styles.comment.fontStyle).toBe("italic");
        expect(styles.accent).not.toBe(styles.muted);
      });

      test("every ASSERT carries the snapshot's result for its own id, and each card the pass or fail with the commit it was for", async ({ page }) => {
        const stamp = `${snapshot.generatedAt.slice(0, 10)} · ${snapshot.commit.slice(0, 7)}`;
        for (const assert of ASSERT_LINES) {
          const row = page.locator(`#rules .bp-adl__row[data-rule="${ruleIdOf(assert.raw)}"]`);
          const result = snapshotRules.find((rule) => rule.id === ruleIdOf(assert.raw));
          expect(result, `${assert.raw} has a result in the snapshot`).toBeDefined();
          await expect(row.locator(".bp-chip")).toHaveText(result!.passed ? "✓ pass" : "✕ fail");
        }
        for (const card of await page.locator("#rules .bp-rule-card--adl").all()) {
          const ids = await card.locator(".bp-adl__row[data-rule]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-rule")!));
          const held = ids.every((id) => snapshotRules.find((rule) => rule.id === id)!.passed);
          await expect(card.locator(".bp-rule-card__foot .bp-chip")).toHaveText(`${held ? "pass" : "fail"} · ${stamp}`);
        }
      });

      test("the header counts the snapshot's rules, not its cards", async ({ page }) => {
        const passing = snapshotRules.filter((rule) => rule.passed).length;
        await expect(page.locator("#rules .bp-bento__meta")).toHaveText(`${passing} of ${snapshotRules.length} rules passing in the last snapshot`);
      });

      test("the other cards keep their own source", async ({ page }) => {
        await expect(page.locator('#rules [data-card="calm"] .bp-rule-card__file')).toHaveText("architecture/calm/");
        await expect(page.locator('#rules [data-card="budget"] .bp-rule-card__file')).toHaveText("architecture/fitness/src/budget-check.ts");
        await expect(page.locator('#rules [data-card="budget"]')).toContainText("Modeled monthly CoinGecko calls stay");
      });

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

      test("every card links to the same file, and a deep link to #structure-adl opens it", async ({ page }) => {
        await expect(page.locator("#rules .bp-rule-card--adl").getByRole("link", { name: "View structure.adl" })).toHaveCount(HEADINGS.length);
        await page.goto("/#structure-adl");
        await expect(page.getByRole("dialog")).toBeVisible();
      });

      test("long lines wrap with a hanging indent and the page never scrolls sideways", async ({ page }) => {
        await noSidewaysScroll(page, "the home page");
        const longest = ASSERT_LINES.reduce((a, b) => (a.raw.length >= b.raw.length ? a : b));
        const line = page.locator(`#rules .bp-adl__row[data-line="${longest.number}"] .bp-adl__line`);
        const metrics = await line.evaluate((node) => {
          const style = getComputedStyle(node);
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = [...range.getClientRects()];
          const tops = [...new Set(rects.map((rect) => Math.round(rect.top)))].sort((a, b) => a - b);
          const leftOf = (top: number) => Math.min(...rects.filter((rect) => Math.round(rect.top) === top).map((rect) => rect.left));
          return { visualLines: tops.length, firstLeft: leftOf(tops[0]!), nextLeft: tops.length > 1 ? leftOf(tops[1]!) : null, whiteSpace: style.whiteSpace, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
        });
        expect(metrics.whiteSpace).toBe("pre-wrap");
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
        if (metrics.nextLeft !== null) expect(metrics.nextLeft, "a wrapped line hangs under the first").toBeGreaterThan(metrics.firstLeft);
        if (viewport.width < 500) expect(metrics.visualLines, "at 390px the longest rule wraps").toBeGreaterThan(1);
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
