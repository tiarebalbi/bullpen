import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The terminal in every state it can be in, at both widths. All routes are mocked at the browser network layer, so no database or provider
// is touched. Set SCREENSHOT_DIR to keep a picture of each state.
const shotDir = process.env.SCREENSHOT_DIR;
async function shot(page: Page, name: string, width: number): Promise<void> {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  // A tall window, so the phone's pinned trade bar sits at the bottom of the picture instead of floating over the middle of it.
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.width, height: Math.max(original.height, await page.evaluate(() => document.documentElement.scrollHeight)) });
  await page.screenshot({ path: join(shotDir, `${name}-${width}.png`) });
  await page.setViewportSize(original);
}

type Answer = unknown | "hang" | { status: number; error: string };
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
async function route(page: Page, pattern: string, value: Answer, fallback: unknown): Promise<void> {
  await page.route(pattern, async (r) => {
    if (value === "hang") return;
    if (value !== null && typeof value === "object" && "error" in value && "status" in value) return r.fulfill(json({ error: (value as { error: string }).error }, (value as { status: number }).status));
    return r.fulfill(json(value ?? fallback));
  });
}
interface Routes { board?: Answer; stocks?: Answer; btc?: Answer }
async function mock(page: Page, { board, stocks, btc }: Routes = {}): Promise<void> {
  await route(page, "**/api/leaderboard", board, { rows: [], total: 0, asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null });
  await route(page, "**/api/stock-prices", stocks, { rows: [] });
  await page.route("**/api/orders", (r) => r.fulfill(json({ error: "sign-in-unavailable", message: "Sign-in is not available here, so orders cannot be placed." }, 503)));
  await route(page, "**/api/price/BTC-USD", btc, { symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() });
}
const entry = (rank: number, handle: string, equity: string, cash = equity) => ({ accountId: `id-${handle}`, handle, cash, positionsValue: "0", equity, rank });
const board = (overrides = {}) => ({ rows: [entry(1, "ada", "1250.75", "800"), entry(2, "grace", "1000")], total: 2, asOf: new Date().toISOString(), ageMs: 15_000, stale: false, lastFailure: null, ...overrides });
const rows = [
  { symbol: "AAPL", price: "190.12", asOf: "2026-10-13T20:00:00.000Z", stale: false },
  { symbol: "MSFT", price: "410.5", asOf: "2026-10-08T20:00:00.000Z", stale: true },
];
const btcAt = (changePercent: number, ageMs = 0) => ({ symbol: "BTC-USD", price: 65432.1, changePercent, time: new Date(Date.now() - ageMs).toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const watchlist = (page: Page) => page.getByRole("complementary", { name: "Watchlist" });
const leaderboard = (page: Page) => page.getByRole("region", { name: "Leaderboard" });
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const wide = viewport.width >= 1024;
  test.describe(`trading app at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("is the terminal's shape: header, watchlist, main and the order rail side by side on a desktop, stacked on a phone", async ({ page }) => {
      await mock(page, { board: board(), stocks: { rows } });
      await page.goto("/");
      await expect(page.getByRole("banner")).toContainText("Bullpen");
      const [header, list, main] = [await box(page, ".bp-terminal__header"), await box(page, ".bp-terminal__watchlist"), await box(page, ".bp-terminal__main")];
      expect(list.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
      if (wide) {
        const rail = await box(page, ".bp-terminal__rail");
        expect(list.x + list.width).toBeLessThanOrEqual(main.x + 1);
        expect(main.x + main.width).toBeLessThanOrEqual(rail.x + 1);
        expect(Math.abs(list.y - main.y)).toBeLessThan(2);
        await expect(page.locator(".bp-terminal__bar")).toBeHidden();
      } else {
        expect(main.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
        await expect(page.locator(".bp-terminal__bar")).toBeVisible();
        await expect(page.locator(".bp-terminal__rail")).toBeHidden();
      }
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "terminal-default", viewport.width);
    });

    test("is dark first, and the toggle switches it and remembers the choice", async ({ page }) => {
      await mock(page);
      await page.goto("/");
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.getByRole("button", { name: "Switch to light theme" }).click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await page.reload();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await shot(page, "terminal-light", viewport.width);
    });

    test("watchlist: each stock with its close date and price, a stale one in words, no gain or loss it does not have, the source credited", async ({ page }) => {
      await mock(page, { stocks: { rows } });
      await page.goto("/");
      const stocks = watchlist(page).getByRole("region", { name: "Stocks" });
      await expect(stocks.getByRole("button")).toHaveCount(2);
      await expect(stocks.getByText("Close · Oct 13")).toBeVisible();
      await expect(stocks.getByText("190.12")).toHaveCSS("font-variant-numeric", "tabular-nums");
      await expect(stocks.getByText(/^Stale · Oct 8$/)).toHaveCount(1);
      await expect(stocks.getByText(/[▲▼]/)).toHaveCount(0);
      await expect(stocks.getByRole("link", { name: "Alpha Vantage" })).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "watchlist-stocks", viewport.width);
    });

    test("watchlist: the header tells the feed truthfully, end of day, on a weekend or in session; a closed market says so on the rows", async ({ page }) => {
      await page.clock.install({ time: new Date("2026-10-17T15:00:00Z") }); // a Saturday
      await mock(page, { stocks: { rows } });
      await page.goto("/");
      await expect(page.getByRole("banner").getByText("Stocks · end of day")).toBeVisible();
      await expect(watchlist(page).getByText("Market closed")).toHaveCount(0); // the status line is for a move or a stale close, never a guess about the clock
      await shot(page, "watchlist-market-closed", viewport.width);
    });

    test("watchlist: crypto shows the live price with a direction glyph and a true minus, the credit beside it", async ({ page }) => {
      await mock(page, { btc: btcAt(-2.42) });
      await page.goto("/");
      const crypto = watchlist(page).getByRole("region", { name: "Crypto" });
      await expect(crypto.getByText("65,432.10")).toBeVisible();
      await expect(crypto.getByText("▼ −2.42%")).toBeVisible();
      await expect(crypto.getByRole("link", { name: "Powered by CoinGecko" })).toHaveAttribute("href", "https://www.coingecko.com/en/api");
      await shot(page, "watchlist-crypto-down", viewport.width);
    });

    test("watchlist: a crypto price older than ten minutes is stale in words, in the row and the header", async ({ page }) => {
      await mock(page, { btc: btcAt(0.5, 20 * 60_000) });
      await page.goto("/");
      await expect(watchlist(page).getByText("Stale", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("banner").getByText("Stale")).toBeVisible();
      await shot(page, "watchlist-crypto-stale", viewport.width);
    });

    test("watchlist: empty before the first close, loading, and failed, each in words", async ({ page }) => {
      await mock(page);
      await page.goto("/");
      await expect(watchlist(page).getByText("No end-of-day prices yet")).toBeVisible();
      await shot(page, "watchlist-empty", viewport.width);

      const loading = await page.context().newPage();
      await mock(loading, { stocks: "hang", btc: "hang" });
      await loading.setViewportSize(viewport);
      await loading.goto("/");
      await expect(loading.getByRole("banner").getByText("Reconnecting")).toBeVisible();
      await expect(loading.getByRole("complementary", { name: "Watchlist" }).getByRole("button")).toHaveCount(0);
      await shot(loading, "watchlist-loading", viewport.width);

      const failed = await page.context().newPage();
      await mock(failed, { stocks: { status: 500, error: "Stock prices unavailable." }, btc: { status: 503, error: "Market data provider is unavailable." } });
      await failed.setViewportSize(viewport);
      await failed.goto("/");
      await expect(failed.getByRole("complementary", { name: "Watchlist" }).getByRole("alert").first()).toBeVisible();
      await expect(failed.getByText("Stock prices unavailable", { exact: true })).toBeVisible();
      await expect(failed.getByText("Market data provider is unavailable.")).toBeVisible();
      await expect(failed.getByText("Database unavailable")).toHaveCount(0); // a provider failure is not the database's
      await shot(failed, "watchlist-failed", viewport.width);
    });

    test("selecting a symbol shows its price in the main panel: a stock's close, then the live crypto price", async ({ page }) => {
      await mock(page, { stocks: { rows } });
      await page.goto("/");
      const detail = page.getByRole("region", { name: "Price detail" });
      await expect(detail.getByTestId("price-cell-price")).toHaveText("65,432.10");
      await watchlist(page).getByRole("button", { name: /^AAPL/ }).click();
      await expect(detail.getByTestId("price-cell-price")).toHaveText("190.12");
      await expect(detail.getByText("Close · Oct 13")).toBeVisible();
      await expect(detail.getByTestId("price-cell-change")).toHaveCount(0);
      await expect(detail.getByText("A chart needs price history; it arrives in Part 5.")).toBeVisible();
      await shot(page, "detail-stock-close", viewport.width);
      await watchlist(page).getByRole("button", { name: /^MSFT/ }).click();
      await expect(detail.getByTestId("price-cell-stale-label")).toContainText("stale · as of Oct 8");
      await shot(page, "detail-stock-stale", viewport.width);
    });

    test("leaderboard: ranked rows with the time it was computed, in tabular figures", async ({ page }) => {
      await mock(page, { board: board() });
      await page.goto("/");
      await expect(leaderboard(page).getByRole("listitem")).toHaveCount(2);
      await expect(leaderboard(page).getByText(/as of \d\d:\d\d:\d\d/)).toBeVisible();
      await expect(leaderboard(page).getByText("$1,250.75")).toHaveCSS("font-variant-numeric", "tabular-nums");
      await expect(leaderboard(page).getByText("cash $800.00")).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "leaderboard-ranked", viewport.width);
    });

    test("leaderboard: tied players share a rank, and the next rank skips the places they take", async ({ page }) => {
      await mock(page, { board: board({ rows: [entry(1, "ada", "500"), entry(1, "bea", "500"), entry(3, "cy", "100")], total: 3 }) });
      await page.goto("/");
      const items = leaderboard(page).getByRole("listitem");
      await expect(items).toHaveCount(3);
      await expect(items.nth(0)).toContainText(/^1/);
      await expect(items.nth(1)).toContainText(/^1/);
      await expect(items.nth(2)).toContainText(/^3/);
      await shot(page, "leaderboard-tie", viewport.width);
    });

    test("leaderboard: says it shows the top of a longer ranking", async ({ page }) => {
      await mock(page, { board: board({ total: 812 }) });
      await page.goto("/");
      await expect(leaderboard(page).getByText("Showing the top 2 of 812 players.")).toBeVisible();
    });

    test("leaderboard: a stale ranking says so in words, and a failed refresh says the last good one stands", async ({ page }) => {
      await mock(page, { board: board({ stale: true, ageMs: 9 * 60_000, asOf: new Date(Date.now() - 9 * 60_000).toISOString(), lastFailure: { at: new Date().toISOString(), error: "x" } }) });
      await page.goto("/");
      await expect(leaderboard(page).getByText("Stale", { exact: true })).toBeVisible();
      await expect(leaderboard(page).getByTestId("leaderboard-refresh-failed")).toContainText("last good ranking");
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "leaderboard-stale", viewport.width);
    });

    test("leaderboard: empty with no players, loading, and failed", async ({ page }) => {
      await mock(page);
      await page.goto("/");
      await expect(leaderboard(page).getByText("No players yet")).toBeVisible();
      await shot(page, "leaderboard-empty", viewport.width);

      const loading = await page.context().newPage();
      await mock(loading, { board: "hang" });
      await loading.setViewportSize(viewport);
      await loading.goto("/");
      await expect(loading.getByRole("region", { name: "Leaderboard" }).getByText("Reconnecting")).toBeVisible();
      await shot(loading, "leaderboard-loading", viewport.width);

      const failed = await page.context().newPage();
      await mock(failed, { board: { status: 500, error: "Leaderboard unavailable." } });
      await failed.setViewportSize(viewport);
      await failed.goto("/");
      await expect(failed.getByRole("region", { name: "Leaderboard" }).getByRole("alert")).toContainText("Leaderboard unavailable");
      await shot(failed, "leaderboard-error", viewport.width);
    });

    test("database unavailable: the stocks and the leaderboard say so, and the live crypto price still shows", async ({ page }) => {
      await mock(page, { board: { status: 503, error: "Leaderboard unavailable." }, stocks: { status: 503, error: "Stock prices unavailable." } });
      await page.goto("/");
      await expect(leaderboard(page).getByRole("alert")).toContainText("Database unavailable");
      await expect(watchlist(page).getByRole("region", { name: "Stocks" }).getByRole("alert")).toContainText("Database unavailable");
      await expect(watchlist(page).getByRole("region", { name: "Crypto" }).getByText("65,432.10")).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await shot(page, "database-unavailable", viewport.width);
    });

    test("where sign-in does not exist the ticket says so and shows no form; on a phone the bar is pinned to the bottom", async ({ page }) => {
      await mock(page);
      await page.goto("/");
      if (wide) {
        const rail = page.getByRole("complementary", { name: "Order ticket" });
        await expect(rail.getByRole("status")).toContainText("Sign-in is not available here");
        await expect(rail.getByLabel("Quantity")).toHaveCount(0);
      } else {
        await expect(page.locator(".bp-tradebar").getByText("Sign-in is off on previews")).toBeVisible();
        const pinned = await box(page, ".bp-terminal__bar");
        expect(Math.abs(pinned.y + pinned.height - viewport.height)).toBeLessThan(2); // pinned to the bottom of the screen
      }
      await shot(page, "order-ticket-off", viewport.width);
    });
  });
}
