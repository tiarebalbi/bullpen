import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The signed-in trading app: the ticket, the portfolio and the seven order states. /api/orders is answered at the browser network layer with
// accounts made in this file (a test fixture, never a page's data). Set SCREENSHOT_DIR to keep a picture of each state in both themes.
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
const order = (state: string, over: Record<string, unknown> = {}) => ({
  orderId: `00000000-0000-4000-8000-${String(state.length).padStart(4, "0")}${state.charCodeAt(0).toString(16).padStart(8, "0")}`, symbol: "AAPL", side: "buy", type: "market", state, quantity: "10.00000000", filledQty: "0.00000000", openQty: "10.00000000", cancelledQty: "0.00000000",
  avgPrice: null, capPrice: "199.62600000", reserved: "1996.26000000", spent: "0.00000000", released: "0.00000000", releaseDone: false, needsAttention: null, createdAt: "2026-10-20T10:00:00.000Z", cancelRequestedAt: null, ...over,
});
const account = (orders: unknown[] = [], over: Record<string, unknown> = {}) => ({
  label: "Player 4F2A", buyingPower: "98000.00000000", reserved: "2000.00000000", cash: "100000.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], orders, asOf: new Date().toISOString(), ...over,
});
const allSeven = [
  order("accepted"),
  order("working"),
  order("partially_filled", { filledQty: "4.00000000", openQty: "6.00000000", avgPrice: "190.12000000", spent: "760.48000000" }),
  order("cancel_requested", { cancelRequestedAt: "2026-10-20T10:01:00.000Z" }),
  order("cancelled", { filledQty: "4.00000000", cancelledQty: "6.00000000", openQty: "0.00000000", avgPrice: "190.12000000", spent: "760.48000000", released: "1235.78000000", releaseDone: true }),
  order("filled", { filledQty: "10.00000000", openQty: "0.00000000", avgPrice: "190.12000000", spent: "1901.20000000", released: "95.06000000", releaseDone: true }),
  order("rejected", { openQty: "0.00000000", cancelledQty: "10.00000000", released: "1996.26000000", releaseDone: true }),
];

async function mock(page: Page, orders: { status: number; body: unknown } | ((req: { method: string }) => { status: number; body: unknown })): Promise<void> {
  await page.route("**/api/leaderboard", (r) => r.fulfill(json({ rows: [{ accountId: "a", handle: "Player 4F2A", cash: "100000", positionsValue: "0", equity: "100000", rank: 1 }], total: 1, asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null })));
  await page.route("**/api/stock-prices", (r) => r.fulfill(json({ rows: [{ symbol: "AAPL", price: "190.12000000", asOf: "2026-10-16T20:00:00.000Z", stale: false }] })));
  await page.route("**/api/price/BTC-USD", (r) => r.fulfill(json({ symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() })));
  await page.route("**/api/orders", (r) => {
    const answer = typeof orders === "function" ? orders({ method: r.request().method() }) : orders;
    return r.fulfill(json(answer.body, answer.status));
  });
}
const signedIn = (orders: unknown[] = [], over = {}) => ({ status: 200, body: account(orders, over) });
const signedOut = { status: 401, body: { error: "sign-in-required", message: "Sign in with GitHub to place an order." } };

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const wide = viewport.width >= 1024;
  test.describe(`signed-in trading app at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("a visitor who is not signed in is invited to sign in, not shown a disabled form", async ({ page }) => {
      await mock(page, signedOut);
      await page.goto("/");
      if (!wide) await page.getByRole("button", { name: "Sign in" }).click();
      const dialog = wide ? page.getByRole("complementary", { name: "Order ticket" }) : page.getByRole("dialog", { name: "Order ticket" });
      await expect(dialog.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled();
      await expect(dialog.getByLabel("Quantity")).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Orders" })).toHaveCount(0);
      await shot(page, "ticket-signed-out", viewport.width);
    });

    test("shows all seven order states, and 'cancel requested' does not look like 'cancelled'", async ({ page }) => {
      await mock(page, signedIn(allSeven));
      await page.goto("/");
      const orders = page.getByRole("list", { name: "Your orders" });
      await expect(orders.getByRole("listitem")).toHaveCount(7);
      const badge = (state: string) => orders.locator(`.bp-order[data-state="${state}"] .bp-state`);
      await expect(badge("cancel_requested")).toContainText("Cancel requested…");
      await expect(badge("cancelled")).toHaveText(/Cancelled$/);
      const look = async (state: string) => badge(state).evaluate((el) => { const s = getComputedStyle(el); return [s.borderTopStyle, s.borderTopWidth, s.fontStyle].join(" "); });
      expect(await look("cancel_requested")).not.toBe(await look("cancelled"));
      await expect(orders.locator('.bp-order[data-state="cancel_requested"]')).toContainText("Waiting for the fill engine to confirm");
      await expect(orders.locator('.bp-order[data-state="cancelled"]')).toContainText("4 of 10 filled at $190.12. $1,235.78 back in buying power.");
      await expect(orders.getByRole("button", { name: "Cancel order" })).toHaveCount(3);
      await shot(page, "orders-seven-states", viewport.width);
    });

    test("an empty account says it is empty: no positions, no orders, and no made-up numbers", async ({ page }) => {
      await mock(page, signedIn([], { reserved: "0.00000000", buyingPower: "100000.00000000" }));
      await page.goto("/");
      await expect(page.getByText("No positions yet")).toBeVisible();
      await expect(page.getByText("No orders yet")).toBeVisible();
      await shot(page, "portfolio-empty", viewport.width);
    });

    test("placing an order from the keyboard: quantity, then the button; one POST with a key, and the order appears", async ({ page }) => {
      const posted: Array<Record<string, string>> = [];
      let placed = false;
      await mock(page, (req) => {
        if (req.method === "POST") return { status: 201, body: { orderId: "o", duplicate: false, account: account([order("accepted")]) } };
        return placed ? { status: 200, body: account([order("accepted")]) } : { status: 200, body: account([]) };
      });
      await page.route("**/api/orders", async (r) => {
        if (r.request().method() === "POST") {
          posted.push(r.request().postDataJSON() as Record<string, string>);
          placed = true;
        }
        await r.fallback();
      });
      await page.goto("/");
      await page.getByRole("button", { name: /^AAPL/ }).click();
      if (!wide) {
        await page.getByRole("button", { name: "Trade" }).focus();
        await page.keyboard.press("Enter");
      }
      const quantity = page.getByLabel("Quantity").locator("visible=true");
      for (let i = 0; i < 40 && !(await quantity.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press(wide ? "Tab" : "Tab");
      await expect(quantity).toBeFocused();
      await page.keyboard.type("3");
      await expect(page.getByText("$570.36").first()).toBeVisible(); // 3 x 190.12
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Buy AAPL" }).locator("visible=true")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect.poll(() => posted.length).toBe(1);
      expect(posted[0]).toMatchObject({ symbol: "AAPL", quantity: "3" });
      expect(posted[0]!.clientOrderId).toMatch(/^[0-9a-f-]{36}$/);
      await expect(page.getByRole("list", { name: "Your orders" }).getByRole("listitem")).toHaveCount(1);
    });

    test("the controls are at least 44 px, nothing overflows, and there are no accessibility violations in either theme", async ({ page }) => {
      await mock(page, signedIn(allSeven));
      await page.goto("/");
      await page.getByRole("button", { name: /^AAPL/ }).click();
      if (!wide) {
        await page.getByRole("button", { name: "Trade" }).click();
        await expect(page.getByLabel("Quantity").locator("visible=true")).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id), "axe with the sheet open").toEqual([]);
      }
      for (const control of await page.locator(".bp-ticket__cta:visible, .bp-order__cancel:visible, .bp-tradebar__open:visible, .bp-sheet__close:visible").all()) {
        const size = (await control.boundingBox())!;
        expect(size.height, "a control shorter than 44 px").toBeGreaterThanOrEqual(43.5);
      }
      if (!wide) await page.keyboard.press("Escape");
      for (const theme of ["dark", "light"]) {
        if (!(await page.locator("html").evaluate((el, t) => el.classList.contains("dark") === (t === "dark"), theme))) await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
        await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished))); // axe reads colours, so let the theme transition end
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`), `axe in ${theme}`).toEqual([]);
        await shot(page, `trading-${theme}`, viewport.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    test("the colour-blind palette changes the colours and keeps the words and glyphs; reduced motion stops the pending pulse", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await mock(page, signedIn(allSeven));
      await page.goto("/");
      const filled = page.locator('.bp-order[data-state="filled"] .bp-state');
      const before = await filled.evaluate((el) => getComputedStyle(el).borderTopColor);
      await page.getByRole("button", { name: "Colour-blind palette" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-cb", "on");
      expect(await filled.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(before);
      await expect(filled).toContainText("Filled");
      expect(await page.locator('.bp-order[data-state="cancel_requested"] .bp-state').evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
      await shot(page, "trading-colour-blind", viewport.width);
    });
  });
}
