import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The states the design draws that the other specs do not: the stale row and its guard, the shortfall with "Set quantity", the closed market and a queued order,
// and the leaderboard with its refresh switched off. Every route is answered at the browser network layer; the clock is pinned; axe runs at both widths in both themes
// (on a phone an open ticket sheet covers the theme toggle, so there only the current theme is checked). Set SCREENSHOT_DIR to keep a picture of each state.
const shotDir = process.env.SCREENSHOT_DIR;
async function shot(page: Page, name: string, width: number): Promise<void> {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.width, height: Math.max(original.height, await page.evaluate(() => document.documentElement.scrollHeight)) });
  await page.screenshot({ path: join(shotDir, `${name}-${width}.png`) });
  await page.setViewportSize(original);
}

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const THURSDAY_OPEN = new Date("2026-11-12T16:00:00Z"); // 11:00 ET
const SATURDAY = new Date("2026-11-14T15:00:00Z"); // 10:00 ET, closed until Monday 9:30 ET
const row = (symbol: string, over: Record<string, unknown> = {}) => ({ symbol, price: "190.12000000", asOf: "2026-11-11T21:00:00.000Z", stale: false, previousClose: { price: "187.00000000", asOf: "2026-11-10T21:00:00.000Z" }, ...over });
const queued = {
  orderId: "00000000-0000-4000-8000-0000000000aa", symbol: "AAPL", side: "buy", type: "market", state: "queued_for_open", quantity: "3.00000000", filledQty: "0.00000000", openQty: "3.00000000", cancelledQty: "0.00000000",
  avgPrice: null, capPrice: "199.62600000", reserved: "598.87800000", spent: "0.00000000", released: "0.00000000", releaseDone: false, needsAttention: null, createdAt: "2026-11-14T14:00:00.000Z", cancelRequestedAt: null,
};
const account = (over: Record<string, unknown> = {}) => ({ label: "Player 4F2A", buyingPower: "98000.00000000", reserved: "0.00000000", cash: "100000.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], orders: [], latestOrder: null, fills: [], asOf: "2026-11-12T15:00:00.000Z", ...over });

interface Scene {
  now?: Date;
  rows?: unknown[];
  account?: Record<string, unknown>;
  leaderboard?: Record<string, unknown>;
}

async function open(page: Page, scene: Scene = {}): Promise<void> {
  const now = scene.now ?? THURSDAY_OPEN;
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => {
    Math.random = () => 0.999;
  });
  const board = { rows: [{ accountId: "a", handle: "Player 4F2A", cash: "100000", positionsValue: "0", equity: "100000", rank: 1 }], total: 1, asOf: now.toISOString(), ageMs: 0, stale: false, lastFailure: null, ...scene.leaderboard };
  await page.route("**/api/leaderboard", (r) => r.fulfill(json(board)));
  // The calm state: the stream is off, so the screen polls and says "Delayed · live prices paused", with no banner. A held-open event stream cannot be mocked at the
  // network layer (a fulfilled stream ends, and the link then reconnects), so these scenes do not depend on one; the live and closed words are the LiveBadge unit tests'.
  await page.route("**/api/stock-prices", (r) => r.fulfill({ ...json({ rows: scene.rows ?? [row("AAPL")] }), headers: { "x-bullpen-stream": "off" } }));
  await page.route("**/api/prices/stream", (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.route("**/api/price/BTC-USD", (r) => r.fulfill(json({ symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: now.toISOString(), source: "coingecko", fetchedAt: now.toISOString() })));
  await page.route("**/api/orders", (r) => r.fulfill(json(account(scene.account))));
  await page.goto("/");
}

/** The guard and the quantity field stay inside the ticket: a long sentence in the guard must not widen the sheet and push the stepper out of it. */
async function guardFits(page: Page): Promise<void> {
  const fit = await page.evaluate(() => {
    const form = [...document.querySelectorAll<HTMLElement>('form[aria-label="Order ticket"]')].find((f) => f.offsetParent !== null)!;
    const inside = (selector: string): boolean => {
      const el = form.querySelector(selector);
      return el === null || el.getBoundingClientRect().right <= form.getBoundingClientRect().right + 0.5;
    };
    return { guard: inside(".bp-ticket__guard"), field: inside(".bp-ticket__field"), stepper: inside(".bp-stepper"), page: document.documentElement.scrollWidth <= window.innerWidth };
  });
  expect(fit).toEqual({ guard: true, field: true, stepper: true, page: true });
}

async function axeNow(page: Page, name: string, bothThemes: boolean): Promise<void> {
  const current = (await page.locator("html").evaluate((el) => el.classList.contains("dark"))) ? "dark" : "light";
  for (const theme of bothThemes ? ["dark", "light"] : [current]) {
    if (!(await page.locator("html").evaluate((el, t) => el.classList.contains("dark") === (t === "dark"), theme))) await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 100)).join(" | ")}`), `${name}, axe in ${theme}`).toEqual([]);
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const wide = viewport.width >= 1024;
  test.describe(`the design's other states at ${viewport.width}px`, () => {
    test.use({ viewport });
    const ticket = (page: Page) => (wide ? page.getByRole("complementary", { name: "Order ticket" }) : page.getByRole("dialog", { name: "Order ticket" }));
    const selectAapl = async (page: Page): Promise<void> => {
      await page.getByRole("button", { name: /^AAPL/ }).click();
      if (!wide) await page.getByRole("button", { name: "Trade" }).click();
    };

    test("a stale row is drawn stale (glyph, word, date), and selecting it puts the stale guard on the ticket with no way to buy anyway", async ({ page }) => {
      await open(page, { rows: [row("AAPL", { stale: true, asOf: "2026-11-06T21:00:00.000Z" })] });
      const watch = page.getByRole("complementary", { name: "Watchlist" });
      await expect(watch.getByText("◷ Stale · Nov 6")).toBeVisible();
      await axeNow(page, "a stale row", true);
      await shot(page, "watchlist-stale-row", viewport.width);
      await selectAapl(page);
      const guard = ticket(page).getByTestId("ticket-guard");
      await expect(guard).toHaveAttribute("data-kind", "stale");
      await expect(guard).toContainText("AAPL’s price is stale");
      await expect(guard).toContainText("Last priced Nov 6.");
      await ticket(page).getByRole("textbox", { name: "Quantity" }).fill("2");
      await expect(ticket(page).getByRole("button", { name: "Price is stale" })).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("button", { name: /anyway/i })).toHaveCount(0);
      await guardFits(page);
      await axeNow(page, "the stale guard", wide);
      await shot(page, "ticket-stale-guard", viewport.width);
    });

    test("a shortfall names the amount and the fix, and Set quantity fits the order exactly to the buying power", async ({ page }) => {
      await open(page, { account: { buyingPower: "2100.00000000" } });
      await selectAapl(page);
      const t = ticket(page);
      await t.getByRole("textbox", { name: "Quantity" }).fill("11");
      const guard = t.getByTestId("ticket-guard");
      await expect(guard).toHaveAttribute("data-kind", "shortfall");
      await expect(guard).toContainText("more than your buying power");
      await expect(guard).toContainText("10 AAPL fits in $2,100.00, with the 5% reserve.");
      await expect(t.getByRole("button", { name: "Not enough buying power" })).toBeVisible();
      await guardFits(page);
      await axeNow(page, "the shortfall guard", wide);
      await shot(page, "ticket-shortfall", viewport.width);
      await t.getByRole("button", { name: "Set quantity to 10" }).click();
      await expect(t.getByRole("textbox", { name: "Quantity" })).toHaveValue("10");
      await expect(t.getByTestId("ticket-guard")).toHaveCount(0);
      await expect(t.getByRole("button", { name: /^Buy 10 AAPL · \$/ })).toBeVisible();
    });

    test("while the market is closed a queued order says when it goes, and the moon does not pulse", async ({ page }) => {
      await open(page, { now: SATURDAY, account: { orders: [queued], reserved: "598.87800000" } });
      const order = page.locator('.bp-order[data-state="queued_for_open"]').first();
      await expect(order).toContainText("Queued for the open (Mon 9:30 ET)");
      await expect(order.locator(".bp-state")).toContainText("☾");
      expect(await order.locator(".bp-state").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
      await axeNow(page, "a queued order, market closed", true);
      await shot(page, "market-closed-queued-order", viewport.width);
      await selectAapl(page);
      const guard = ticket(page).getByTestId("ticket-guard");
      await expect(guard).toHaveAttribute("data-kind", "closed");
      expect(await guard.locator(".bp-ticket__guard-glyph").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    });

    test("with the leaderboard refresh switched off the panel says Paused and that this is the last good ranking", async ({ page }) => {
      await open(page, { leaderboard: { refresh: "paused" } });
      await expect(page.getByTestId("leaderboard-paused")).toContainText("❚❚ Paused");
      await expect(page.getByTestId("leaderboard-paused-note")).toContainText("This is the last good one");
      await axeNow(page, "the paused leaderboard", true);
      await shot(page, "leaderboard-paused", viewport.width);
    });
  });
}
