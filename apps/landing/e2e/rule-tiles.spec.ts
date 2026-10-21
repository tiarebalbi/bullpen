import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { loadLatestRulesSnapshot } from "../lib/rulesSnapshot.js";

// The eight tiles and the panel they open, checked against structure.adl and the committed snapshot themselves.

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const adlLines = readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8").split("\n");
const snapshot = loadLatestRulesSnapshot(join(repoRoot, "architecture", "reports"))!;
const snapshotRules = snapshot.checks.flatMap((check) => check.rules);
const stamp = `${snapshot.generatedAt.slice(0, 10)} · ${snapshot.commit.slice(0, 7)}`;
const slugOf = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const HEADINGS = adlLines.filter((line) => line.startsWith("# ")).map((line) => line.slice(2));
const groupAsserts = (heading: string): string[] => {
  const start = adlLines.findIndex((line) => line === `# ${heading}`);
  const out: string[] = [];
  for (let i = start + 1; i < adlLines.length && !adlLines[i]!.startsWith("# "); i++) if (adlLines[i]!.startsWith("ASSERT(")) out.push(adlLines[i]!);
  return out;
};
const adlIds = new Set(adlLines.filter((l) => l.startsWith("ASSERT(")).map((l) => slugOf(l.slice("ASSERT(".length, -1))));
// The mapping the tiles promise: a rule with no ASSERT line is listed in the tile of its family.
const FAMILY: Record<string, string> = { "model currency": "Model currency", "explorer consistency": "Model currency", "data ownership": "Data ownership", "rule coverage": "Structural assertions", "email in files": "Entry points and secrets" };
const extrasOf = (heading: string) => snapshotRules.filter((r) => !adlIds.has(r.id) && r.check !== "budget" && FAMILY[r.check] === heading);
const titleOf = (heading: string): string => heading.replace(/\s*\(.+\)$/, "");
const budgetRules = snapshotRules.filter((r) => r.check === "budget");

async function open(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}
const tileId = (title: string): string => {
  if (title === "CALM model") return "calm";
  if (title === "Free-tier budget") return "budget";
  return `adl-${slugOf(HEADINGS.find((heading) => titleOf(heading) === title)!)}`;
};
const tileFor = (page: Page, title: string): Locator => page.locator(`.bp-tile[data-tile="${tileId(title)}"]`);
const panel = (page: Page): Locator => page.locator(".bp-tile-detail");

for (const viewport of [
  { label: "1440px", width: 1440, height: 1100 },
  { label: "390px", width: 390, height: 844 },
]) {
  test.describe(`Rule tiles at ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test.beforeEach(async ({ page }) => open(page));

    test("one tile per # heading in the file's order, then the CALM model and the budget, each with its count label", async ({ page }) => {
      const tiles = page.locator(".bp-tile");
      await expect(tiles).toHaveCount(HEADINGS.length + 2);
      const titles = await tiles.locator(".bp-tile__title").evaluateAll((els) => els.map((el) => el.firstChild?.textContent?.trim()));
      expect(titles).toEqual([...HEADINGS.map(titleOf), "CALM model", "Free-tier budget"]);
      for (const [i, heading] of HEADINGS.entries()) {
        const n = groupAsserts(heading).length + extrasOf(heading).length;
        await expect(tiles.nth(i).locator(".bp-tile__count")).toHaveText(`${n} ${n === 1 ? "rule" : "rules"}`);
      }
      await expect(tiles.nth(HEADINGS.length).locator(".bp-tile__count")).toHaveText("CLI check");
      await expect(tiles.nth(HEADINGS.length + 1).locator(".bp-tile__count")).toHaveText("Fitness function");
      for (const tile of await tiles.all()) await expect(tile.locator(".bp-tile__bottom")).toContainText("every push (CI)");
    });

    test("the tile counts add up to the headline, and the headline is what the snapshot ran", async ({ page }) => {
      const sum = HEADINGS.reduce((n, h) => n + groupAsserts(h).length + extrasOf(h).length, 0) + budgetRules.length;
      expect(sum).toBe(snapshotRules.length);
      const passing = snapshotRules.filter((r) => r.passed).length;
      const ratio = page.locator("#rules .bp-rules-stat__ratio");
      await expect(ratio).toHaveText(`${passing}/${snapshotRules.length}`);
      await expect(page.locator("#rules .bp-rules-stat__stamp")).toHaveText(stamp);
      const labels = await page.locator(".bp-tile .bp-tile__count").allTextContents();
      const shown = labels.reduce((n, label) => n + (/^(\d+) rules?$/.exec(label)?.[1] ? Number(/^(\d+)/.exec(label)![1]) : 0), 0) + budgetRules.length;
      expect(shown).toBe(snapshotRules.length);
    });

    test("opening a tile shows its ASSERT lines as the file has them, and the rules with no ASSERT line under their own heading", async ({ page }) => {
      for (const heading of HEADINGS) {
        await tileFor(page, titleOf(heading)).click();
        await expect(panel(page)).toHaveCount(1);
        await expect(panel(page).locator(".bp-tile-detail__head").first()).toHaveText(`# ${heading}`);
        const rows = await panel(page).locator(".bp-tile-detail__rows").first().locator(".bp-tile-row__text").allTextContents();
        expect(rows).toEqual(groupAsserts(heading));
        const extras = extrasOf(heading);
        if (extras.length > 0) {
          await expect(panel(page).getByText("Also enforced here, with no line in structure.adl")).toBeVisible();
          expect(await panel(page).locator(".bp-tile-detail__rows").nth(1).locator(".bp-tile-row__text").allTextContents()).toEqual(extras.map((r) => r.rule));
        } else {
          await expect(panel(page).getByText("Also enforced here")).toHaveCount(0);
        }
        const chips = await panel(page).locator(".bp-tile-row .bp-chip").allTextContents();
        expect(chips).toHaveLength(rows.length + extras.length);
        for (const chip of chips) expect(chip).toBe("✓ pass");
        await expect(panel(page).locator(".bp-tile-detail__foot")).toContainText(`pass · ${stamp}`);
        await expect(panel(page).locator(".bp-tile-detail__file")).toContainText("architecture/adl/structure.adl");
      }
    });

    test("the CALM and budget tiles open to their own source and result", async ({ page }) => {
      await tileFor(page, "CALM model").click();
      await expect(panel(page).locator(".bp-tile-detail__file")).toHaveText("architecture/calm/");
      await expect(panel(page)).toContainText("calm validate --strict -f junit");
      await expect(panel(page).locator(".bp-tile-detail__foot")).toContainText(`pass · ${stamp}`);
      await tileFor(page, "Free-tier budget").click();
      await expect(panel(page).locator(".bp-tile-detail__file")).toHaveText("architecture/fitness/src/budget-check.ts");
      await expect(panel(page)).toContainText("Modeled monthly CoinGecko calls stay");
    });

    test("ASSERT lines in the panel are coloured with the design system's tokens", async ({ page }) => {
      await tileFor(page, "Allowed dependencies").click();
      const colours = await page.evaluate(() => {
        const resolve = (value: string): string => {
          const probe = document.createElement("span");
          probe.style.color = value;
          document.querySelector(".bp-tile-detail")!.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const keyword = document.querySelector(".bp-tile-detail .bp-adl__keyword")!;
        const name = document.querySelector(".bp-tile-detail .bp-adl__name")!;
        return { keyword: getComputedStyle(keyword).color, name: getComputedStyle(name).color, accent: resolve("var(--bp-accent-text)"), primary: resolve("var(--foreground)") };
      });
      expect(colours.keyword).toBe(colours.accent);
      expect(colours.name).toBe(colours.primary);
    });

    test("Close closes the panel and returns focus to the tile", async ({ page }) => {
      const tile = tileFor(page, "Data ownership");
      await tile.click();
      await expect(tile).toHaveAttribute("aria-expanded", "true");
      await expect(panel(page)).toBeVisible();
      await panel(page).getByRole("button", { name: "Close" }).click();
      await expect(panel(page)).toHaveCount(0);
      await expect(tile).toHaveAttribute("aria-expanded", "false");
      await expect(tile).toBeFocused();
    });

    test("Escape closes the panel and returns focus to the tile", async ({ page }) => {
      const tile = tileFor(page, "Model currency");
      await tile.click();
      await expect(panel(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel(page)).toHaveCount(0);
      await expect(tile).toBeFocused();
    });

    test("with the keyboard: Enter on a focused tile opens the panel and moves focus into it, Escape gives it back", async ({ page }) => {
      const tile = tileFor(page, "Allowed dependencies");
      await tile.focus();
      await page.keyboard.press("Enter");
      await expect(panel(page)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(panel(page).getByRole("link", { name: "View structure.adl" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(tile).toBeFocused();
    });

    test("opening a second tile swaps the panel: there is never more than one", async ({ page }) => {
      await tileFor(page, "Structural assertions").click();
      await tileFor(page, "Data ownership").click();
      await expect(panel(page)).toHaveCount(1);
      await expect(panel(page).locator(".bp-tile-detail__title")).toHaveText("Data ownership");
      await expect(tileFor(page, "Structural assertions")).toHaveAttribute("aria-expanded", "false");
      await tileFor(page, "Data ownership").click();
      await expect(panel(page)).toHaveCount(0);
    });

    test("the focus ring is visible on a tile and on Close, and every target is at least 44px on a phone", async ({ page }) => {
      const tile = tileFor(page, "Allowed dependencies");
      await tile.focus();
      expect(await tile.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      if (viewport.width < 500) {
        for (const box of await page.locator(".bp-tile").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))) expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await tile.click();
      const close = panel(page).getByRole("button", { name: "Close" });
      await close.focus();
      expect(await close.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });

    test("where the panel sits: below the whole grid on a wide screen, directly under its tile on a narrow one", async ({ page }) => {
      const titles = [...HEADINGS.map(titleOf), "CALM model", "Free-tier budget"];
      const pick = "Allowed dependencies";
      await tileFor(page, pick).click();
      const g = await page.evaluate(() => {
        const abs = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, width: r.width };
        };
        return { tiles: [...document.querySelectorAll(".bp-tile")].map(abs), panel: abs(document.querySelector(".bp-tile-detail")!), grid: abs(document.querySelector(".bp-status-grid")!) };
      });
      const index = titles.indexOf(pick);
      if (viewport.width > 900) {
        expect(g.panel.top).toBeGreaterThanOrEqual(Math.max(...g.tiles.map((t) => t.bottom)) - 2);
        expect(Math.abs(g.panel.width - g.grid.width)).toBeLessThan(2);
      } else {
        expect(g.panel.top).toBeGreaterThanOrEqual(g.tiles[index]!.bottom - 2);
        expect(g.panel.bottom).toBeLessThanOrEqual(g.tiles[index + 1]!.top + 2);
      }
    });
  });
}
