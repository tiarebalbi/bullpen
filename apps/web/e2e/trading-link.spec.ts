import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

// What the player sees when the price link is not simply live: reconnecting with prices on screen, offline (with Retry now), and the polling fallback, with the stream
// failing or switched off. Every route is answered at the browser network layer, the clock is pinned to a Thursday 11:00 ET so the market's hours cannot change a word,
// and Math.random is pinned so the stream's backoff is the same on every run. Axe runs on each state at both widths in both themes.
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers });
const prices = { rows: [{ symbol: "AAPL", price: "190.12000000", asOf: "2026-11-11T21:00:00.000Z", stale: false, previousClose: { price: "187.00000000", asOf: "2026-11-10T21:00:00.000Z" } }] };

interface Link {
  /** Requests the page has made to each route, so a test can see "Retry now" make new ones. */
  streams: number;
  polls: number;
  /** The poll answers 200 when true, 503 when false, and fails to connect at all when "network". */
  poll: boolean | "network";
  pollHeaders: Record<string, string>;
}

async function mock(page: Page, link: Link, stream: (route: Route, nth: number) => Promise<void> | void): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-11-12T16:00:00Z"));
  await page.addInitScript(() => {
    Math.random = () => 0.999;
  });
  await page.route("**/api/leaderboard", (r) => r.fulfill(json({ rows: [], total: 0, asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null })));
  await page.route("**/api/price/BTC-USD", (r) => r.fulfill(json({ symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() })));
  await page.route("**/api/orders", (r) => r.fulfill(json({ error: "sign-in-required", message: "Sign in to see your account." }, 401)));
  await page.route("**/api/stock-prices", (r) => {
    link.polls += 1;
    if (link.poll === "network") return r.abort("connectionrefused");
    return link.poll ? r.fulfill(json(prices, 200, link.pollHeaders)) : r.fulfill(json({ error: "Stock prices unavailable." }, 503));
  });
  await page.route("**/api/prices/stream", (r) => {
    link.streams += 1;
    return stream(r, link.streams);
  });
}

const newLink = (over: Partial<Link> = {}): Link => ({ streams: 0, polls: 0, poll: true, pollHeaders: {}, ...over });
/** One frame, then the connection ends, which an event stream reports as an error: the stream "dropped" with prices on screen. */
const oneFrameThenEnd = (route: Route): Promise<void> => route.fulfill({ status: 200, contentType: "text/event-stream", body: `event: prices\nid: 1.1.0\ndata: ${JSON.stringify({ ...prices, servedAt: 1 })}\n\n` });
const indicator = (page: Page) => page.getByRole("complementary", { name: "Watchlist" }).locator(".bp-connection-indicator");
const banner = (page: Page) => page.locator(".bp-market-banner");

async function axeInBothThemes(page: Page, name: string): Promise<void> {
  for (const theme of ["dark", "light"]) {
    if (!(await page.locator("html").evaluate((el, t) => el.classList.contains("dark") === (t === "dark"), theme))) await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    // A theme switch fades the colours, and a spinner turns for ever; axe measures the settled page, so wait for the finite animations only.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.html.slice(0, 100)} ${JSON.stringify(n.any[0]?.data ?? null)}`).join(" | ")}`), `${name}, axe in ${theme}`).toEqual([]);
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`the price link at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("reconnecting with prices on screen: the banner says the last prices were received at a time and that orders still use the stored price, and the indicator says attempt 1 of 3", async ({ page }) => {
      const link = newLink();
      await mock(page, link, (route, nth) => (nth === 1 ? oneFrameThenEnd(route) : undefined)); // later attempts are left hanging: the stream is "reconnecting"
      await page.goto("/");
      await expect(banner(page)).toBeVisible();
      await expect(banner(page)).toHaveAttribute("data-kind", "reconnecting");
      await expect(banner(page)).toContainText("Reconnecting to market data.");
      await expect(banner(page)).toContainText(/Prices shown are the last received, at \d\d:\d\d:\d\d\. Orders still use the latest stored price\./);
      await expect(banner(page)).not.toContainText(/wait/i); // the design's "orders wait for live quotes" is not how Bullpen works
      await expect(banner(page).getByRole("button", { name: "Retry now" })).toHaveCount(0);
      await expect(indicator(page)).toContainText("Reconnecting");
      await expect(indicator(page)).toContainText("stocks · attempt 1 of 3");
      await expect(page.getByRole("button", { name: /AAPL/ })).toBeVisible(); // the last prices stay on screen
      await axeInBothThemes(page, "reconnecting");
    });

    for (const [name, poll, title] of [
      ["the app answers 503", false, "Prices are unavailable."],
      ["nothing answers at all", "network", "You\u2019re offline."],
    ] as const) {
      test(`offline, when ${name}: the banner is a ✕ alert with the words, a countdown and Retry now; refused safely, nothing reserved`, async ({ page }) => {
        const link = newLink({ poll });
        await mock(page, link, (route) => route.abort("connectionrefused"));
        await page.goto("/");
        await expect(banner(page)).toBeVisible();
        await expect(banner(page)).toHaveAttribute("data-kind", "offline");
        await expect(banner(page)).toContainText(title);
        await expect(banner(page)).toContainText("No prices have arrived yet. New orders are refused safely until the app answers; nothing is reserved.");
        await expect(banner(page)).toContainText(/Retrying in \d+ s\./);
        await expect(banner(page)).not.toContainText(/frozen/i); // there are no prices to freeze
        await expect(indicator(page)).toContainText("Offline");
        await expect(indicator(page)).toContainText(/retry in \d+ s/);
        await axeInBothThemes(page, `offline (${name})`);
      });
    }

    test("Retry now asks again at once, and the banner and the Offline indicator go when the answer comes", async ({ page }) => {
      const link = newLink({ poll: false });
      await mock(page, link, (route) => route.abort("connectionrefused"));
      await page.goto("/");
      await expect(banner(page)).toHaveAttribute("data-kind", "offline");
      const [streams, polls] = [link.streams, link.polls];
      await banner(page).getByRole("button", { name: "Retry now" }).click();
      await expect.poll(() => link.polls).toBeGreaterThan(polls);
      await expect.poll(() => link.streams).toBeGreaterThan(streams);
      await expect(banner(page)).toBeVisible(); // still down: still says so

      link.poll = true; // the app is back
      await banner(page).getByRole("button", { name: "Retry now" }).click();
      await expect(banner(page)).toHaveCount(0);
      await expect(indicator(page)).toContainText("Delayed");
      await expect(page.getByRole("button", { name: /AAPL/ })).toBeVisible();
    });

    test("the polling fallback is Delayed, refreshing every 10 s, with no banner: prices are arriving", async ({ page }) => {
      const link = newLink();
      await mock(page, link, (route) => route.abort("connectionrefused"));
      await page.goto("/");
      await expect(indicator(page)).toContainText("Delayed");
      await expect(indicator(page)).toContainText("refreshes every 10 s");
      await expect(banner(page)).toHaveCount(0);
      await axeInBothThemes(page, "delayed");
    });

    test("with the price-stream switch off the indicator says live prices are paused, still with no banner", async ({ page }) => {
      const link = newLink({ pollHeaders: { "x-bullpen-stream": "off" } });
      await mock(page, link, (route) => route.fulfill(json({ error: "stream-off", message: "Live prices are paused; prices refresh by polling." }, 503, { "x-bullpen-stream": "off" })));
      await page.goto("/");
      await expect(indicator(page)).toContainText("Delayed");
      await expect(indicator(page)).toContainText("live prices paused");
      await expect(banner(page)).toHaveCount(0);
      await axeInBothThemes(page, "stream paused");
    });
  });
}
