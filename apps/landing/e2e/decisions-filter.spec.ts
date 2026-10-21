import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The tabs, counts and captions are checked against the ADR files themselves, so a new ADR changes them with no edit here.
const adrDir = join(import.meta.dirname, "..", "..", "..", "architecture", "adr");
const parts = readdirSync(adrDir)
  .filter((name) => /^\d{4}-.*\.md$/.test(name))
  .map((name) => Number(/^## Part\s+(\d+)/m.exec(readFileSync(join(adrDir, name), "utf8"))![1]));
const total = parts.length;
const partsPresent = [...new Set(parts)].sort((a, b) => a - b);
const countIn = (part: number): number => parts.filter((p) => p === part).length;

async function open(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

test.describe("Decisions filter and View all", () => {
  test.use({ viewport: { width: 1440, height: 1400 } });
  test.beforeEach(async ({ page }) => open(page));

  test("has an All tab and a tab for each part with a decision, each with its count, and All is selected", async ({ page }) => {
    const tabs = page.locator("#decisions").getByRole("tab");
    await expect(tabs).toHaveCount(1 + partsPresent.length);
    await expect(tabs.first()).toHaveText(`All ${total}`);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    for (const [i, part] of partsPresent.entries()) await expect(tabs.nth(i + 1)).toHaveText(`Part ${part} ${countIn(part)}`);
  });

  test("shows six rows and the caption '6 of N decisions'; View all expands in place and Show fewer puts it back", async ({ page }) => {
    const card = page.locator("#decisions");
    const rows = card.locator(".bp-decisions-row");
    const more = card.getByRole("button", { name: /View all|Show fewer/ });
    await expect(rows).toHaveCount(6);
    await expect(card.getByText(`6 of ${total} decisions`)).toBeVisible();
    await expect(more).toHaveText(`View all ${total} →`);
    await expect(more).toHaveAttribute("aria-expanded", "false");

    const before = await card.boundingBox();
    await more.click();
    await expect(rows).toHaveCount(total);
    await expect(more).toHaveText("Show fewer");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(card.getByText(`${total} of ${total} decisions`)).toBeVisible();
    expect((await card.boundingBox())!.height).toBeGreaterThan(before!.height);

    await more.click();
    await expect(rows).toHaveCount(6);
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });

  for (const part of partsPresent) {
    test(`the Part ${part} tab lists only Part ${part}, with the caption and the button the count calls for`, async ({ page }) => {
      const card = page.locator("#decisions");
      await card.getByRole("tab", { name: new RegExp(`^Part ${part} `) }).click();
      const n = countIn(part);
      await expect(card.locator(".bp-decisions-row")).toHaveCount(Math.min(6, n));
      for (const meta of await card.locator(".bp-decisions-row__meta").allTextContents()) expect(meta).toContain(`Part ${part}`);
      await expect(card.getByText(`${Math.min(6, n)} of ${n} in Part ${part}`)).toBeVisible();
      await expect(card.getByRole("button", { name: /View all|Show fewer/ })).toHaveCount(n > 6 ? 1 : 0);
    });
  }

  test("changing tab collapses an expanded list", async ({ page }) => {
    const card = page.locator("#decisions");
    await card.getByRole("button", { name: /View all/ }).click();
    await expect(card.locator(".bp-decisions-row")).toHaveCount(total);
    await card.getByRole("tab", { name: /^Part 1 / }).click();
    await card.getByRole("tab", { name: /^All / }).click();
    await expect(card.locator(".bp-decisions-row")).toHaveCount(6);
  });

  test("arrow keys, Home and End move between the tabs and select them, and only the selected tab is in the tab order", async ({ page }) => {
    const tabs = page.locator("#decisions").getByRole("tab");
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.first()).toHaveAttribute("tabindex", "-1");
    await page.keyboard.press("End");
    await expect(tabs.last()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.first()).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tabs.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  });

  test("a decision listed under View all opens in the same dialog, and Escape returns focus to its row", async ({ page }) => {
    const card = page.locator("#decisions");
    await card.getByRole("button", { name: /View all/ }).click();
    const last = card.locator(".bp-decisions-row").last();
    await last.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(last).toBeFocused();
  });

  test("a decision that is not Accepted says so on its row, and an Accepted one has no chip", async ({ page }) => {
    const card = page.locator("#decisions");
    await card.getByRole("button", { name: /View all/ }).click();
    for (const row of await card.locator(".bp-decisions-row").all()) {
      const id = (await row.locator(".bp-decisions-row__id").textContent())!;
      const file = readdirSync(adrDir).find((name) => name.startsWith(id.replace("ADR-", "")))!;
      const status = /^## Status\s+(\S+)/m.exec(readFileSync(join(adrDir, file), "utf8"))![1];
      await expect(row.locator(".bp-chip")).toHaveCount(status === "Accepted" ? 0 : 1);
    }
  });
});

test.describe("Decisions filter at 390px", () => {
  test.use({ viewport: { width: 390, height: 1400 } });
  test.beforeEach(async ({ page }) => open(page));

  test("the tabs scroll sideways inside their row, every target is at least 44px tall, and the page does not scroll", async ({ page }) => {
    const tabs = page.locator("#decisions").getByRole("tab");
    for (const box of await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))) expect(box.height).toBeGreaterThanOrEqual(44);
    const list = page.locator("#decisions .bp-decision-tabs");
    expect(await list.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("View all is a full-width 44px button that expands in place", async ({ page }) => {
    const card = page.locator("#decisions");
    const more = card.locator(".bp-decision-more");
    const [box, cardBox] = await Promise.all([more.boundingBox(), card.boundingBox()]);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThan(cardBox!.width * 0.8);
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
  });
});
