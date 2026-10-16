import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Every screen the trading app has in Part 3, in each state it can be in, at both widths. All routes are mocked at the
// browser network layer, so no database or provider is touched. Set SCREENSHOT_DIR to keep a picture of each state.
const shotDir = process.env.SCREENSHOT_DIR;
async function shot(page: Page, name: string, width: number): Promise<void> {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: join(shotDir, `${name}-${width}.png`), fullPage: true });
}

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
interface Routes {
  board?: unknown | "error" | "hang";
  stocks?: unknown | "error" | "hang";
  btc?: unknown | "error" | "hang";
}
async function mock(page: Page, { board, stocks, btc }: Routes): Promise<void> {
  const answer = (value: unknown | undefined, fallback: unknown) => async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    if (value === "hang") return;
    if (value === "error") return route.fulfill(json({ error: "unavailable upstream" }, 502));
    return route.fulfill(json(value ?? fallback));
  };
  await page.route("**/api/leaderboard", answer(board, { rows: [], asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null }));
  await page.route("**/api/stock-prices", answer(stocks, { rows: [] }));
  await page.route("**/api/price/BTC-USD", answer(btc, { symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }));
}
const entry = (rank: number, handle: string, equity: string, cash = equity) => ({ accountId: `id-${rank}`, handle, cash, positionsValue: "0", equity, rank });
const board = (overrides = {}) => ({ rows: [entry(1, "ada", "1250.75", "800"), entry(2, "grace", "1000")], asOf: new Date().toISOString(), ageMs: 15_000, stale: false, lastFailure: null, ...overrides });
const stocks = [
  { symbol: "AAPL", price: "190.12", asOf: "2026-10-13T20:00:00.000Z", stale: false },
  { symbol: "MSFT", price: "410.5", asOf: "2026-10-08T20:00:00.000Z", stale: true },
];
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`trading app screens at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("leaderboard: ranked rows with the time it was computed, in tabular figures", async ({ page }) => {
      await mock(page, { board: board() });
      await page.goto("/");
      const panel = page.getByRole("region", { name: "Leaderboard" });
      await expect(panel.getByRole("listitem")).toHaveCount(2);
      await expect(panel.getByText(/as of \d\d:\d\d:\d\d/)).toBeVisible();
      await expect(panel.getByText("$1,250.75")).toHaveCSS("font-variant-numeric", "tabular-nums");
      await expect(panel.getByText("cash $800.00")).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "leaderboard-ranked", viewport.width);
    });

    test("leaderboard: stale ranking says so in words, and a failed refresh says the last good one stands", async ({ page }) => {
      await mock(page, { board: board({ stale: true, ageMs: 9 * 60_000, asOf: new Date(Date.now() - 9 * 60_000).toISOString(), lastFailure: { at: new Date().toISOString(), error: "x" } }) });
      await page.goto("/");
      const panel = page.getByRole("region", { name: "Leaderboard" });
      await expect(panel.getByText("Stale", { exact: true })).toBeVisible();
      await expect(panel.getByTestId("leaderboard-refresh-failed")).toContainText("last good ranking");
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "leaderboard-stale", viewport.width);
    });

    test("leaderboard: empty with no players, loading, and failed", async ({ page }) => {
      await mock(page, { board: { rows: [], asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null } });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Leaderboard" }).getByText("No players yet")).toBeVisible();
      await shot(page, "leaderboard-empty", viewport.width);

      const loading = await page.context().newPage();
      await mock(loading, { board: "hang" });
      await loading.setViewportSize(viewport);
      await loading.goto("/");
      await expect(loading.getByRole("region", { name: "Leaderboard" }).getByText("Reconnecting")).toBeVisible();
      await shot(loading, "leaderboard-loading", viewport.width);

      const failed = await page.context().newPage();
      await mock(failed, { board: "error" });
      await failed.setViewportSize(viewport);
      await failed.goto("/");
      await expect(failed.getByRole("region", { name: "Leaderboard" }).getByRole("alert")).toContainText("Leaderboard unavailable");
      await shot(failed, "leaderboard-error", viewport.width);
    });

    test("stock prices: each close with its date and the close time, one stale one labelled in words", async ({ page }) => {
      await mock(page, { stocks: { rows: stocks } });
      await page.goto("/");
      const panel = page.getByRole("region", { name: "Stock prices" });
      await expect(panel.getByRole("listitem")).toHaveCount(2);
      await expect(panel.getByText("Close · 16:00 ET")).toHaveCount(2);
      await expect(panel.getByText(/stale · as of Oct 8/)).toHaveCount(1);
      await expect(panel.getByText("older than its close")).toHaveCount(1);
      await expect(panel.getByText("190.12")).toHaveCSS("font-variant-numeric", "tabular-nums");
      await expect(panel.getByRole("link", { name: "Alpha Vantage" })).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "stocks-close-and-stale", viewport.width);
    });

    test("stock prices: says market closed on a weekend, and nothing about it while the clock might have it open", async ({ page }) => {
      await page.clock.install({ time: new Date("2026-10-17T15:00:00Z") }); // a Saturday
      await mock(page, { stocks: { rows: stocks } });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Stock prices" }).getByText("Market closed")).toBeVisible();
      await shot(page, "stocks-market-closed", viewport.width);

      const open = await page.context().newPage();
      await open.clock.install({ time: new Date("2026-10-14T16:00:00Z") }); // a Wednesday, 12:00 in New York
      await mock(open, { stocks: { rows: stocks } });
      await open.setViewportSize(viewport);
      await open.goto("/");
      await expect(open.getByRole("region", { name: "Stock prices" }).getByText("AAPL", { exact: true }).last()).toBeVisible();
      await expect(open.getByRole("region", { name: "Stock prices" }).getByText("Market closed")).toHaveCount(0);
    });

    test("stock prices: empty before the first close, and failed", async ({ page }) => {
      await mock(page, { stocks: { rows: [] } });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Stock prices" }).getByText("No end-of-day prices yet")).toBeVisible();
      await shot(page, "stocks-empty", viewport.width);

      const failed = await page.context().newPage();
      await mock(failed, { stocks: "error" });
      await failed.setViewportSize(viewport);
      await failed.goto("/");
      await expect(failed.getByRole("region", { name: "Stock prices" }).getByRole("alert")).toContainText("Stock prices unavailable");
    });

    test("live price: a signed change with a direction glyph, never colour alone, and an error state", async ({ page }) => {
      await mock(page, { btc: { symbol: "BTC-USD", price: 65432.1, changePercent: -2.42, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() } });
      await page.goto("/");
      const panel = page.getByRole("region", { name: "Live price" });
      await expect(panel.getByTestId("price-cell-price")).toHaveText("65,432.10");
      await expect(panel.getByTestId("price-cell-change")).toContainText("▼");
      await expect(panel.getByTestId("price-cell-change")).toContainText("−2.42%");
      await expect(panel.getByRole("link", { name: "Powered by CoinGecko" })).toBeVisible();
      await shot(page, "price-live-down", viewport.width);

      const failed = await page.context().newPage();
      await mock(failed, { btc: "error" });
      await failed.setViewportSize(viewport);
      await failed.goto("/");
      await expect(failed.getByRole("region", { name: "Live price" }).getByRole("alert")).toContainText("Price unavailable");
      await shot(failed, "price-error", viewport.width);
    });

    test("live price: a price older than ten minutes is labelled stale", async ({ page }) => {
      await mock(page, { btc: { symbol: "BTC-USD", price: 65000, changePercent: 0.5, time: new Date(Date.now() - 20 * 60_000).toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() } });
      await page.goto("/");
      await expect(page.getByRole("region", { name: "Live price" }).getByText("Stale", { exact: true })).toBeVisible();
      await shot(page, "price-stale", viewport.width);
    });
  });
}
