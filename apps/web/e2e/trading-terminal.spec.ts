import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The terminal's panels from one order's whole life: ticket, step line, fill, positions, cancel and the shortcuts. /api/orders is answered at the
// browser network layer by a small stateful account made in this file (a fixture, never a page's data): a POST places an order, and each
// later GET moves it one step the way the lifecycle does.
// Set SCREENSHOT_DIR to keep a picture of the filled terminal in both themes (the design review's "ours" column).
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
const ID = "00000000-0000-4000-8000-000000000001";
const T = (s: number) => new Date(Date.UTC(2026, 9, 20, 14, 0, s)).toISOString();

type Phase = "none" | "working" | "filled" | "cancel_requested" | "cancelled";

function makeServer(options: { fillOnNextPoll?: boolean } = {}) {
  const server = { phase: "none" as Phase, posts: [] as unknown[], cancels: 0, fillOnNextPoll: options.fillOnNextPoll ?? true };
  const order = () => {
    const filled = server.phase === "filled";
    const cancelled = server.phase === "cancelled";
    return {
      orderId: ID, symbol: "AAPL", side: "buy", type: "market", state: server.phase, quantity: "3.00000000", filledQty: filled ? "3.00000000" : "0.00000000", openQty: filled || cancelled ? "0.00000000" : "3.00000000", cancelledQty: cancelled ? "3.00000000" : "0.00000000",
      avgPrice: filled ? "190.12000000" : null, capPrice: "199.62600000", reserved: "598.87800000", spent: filled ? "570.36000000" : "0.00000000", released: filled ? "28.51800000" : cancelled ? "598.87800000" : "0.00000000", releaseDone: filled || cancelled, needsAttention: null, createdAt: T(0), cancelRequestedAt: server.phase === "cancel_requested" || cancelled ? T(5) : null,
    };
  };
  const events = () => [
    { kind: "accepted", at: T(0), state: "accepted", quantity: "3.00000000", price: null },
    { kind: "working", at: T(1), state: "working", quantity: null, price: null },
    ...(server.phase === "filled" ? [{ kind: "fill", at: T(2), state: "filled", quantity: "3.00000000", price: "190.12000000" }, { kind: "released", at: T(3), state: "filled", quantity: null, price: null }] : []),
    ...(server.phase === "cancel_requested" ? [{ kind: "cancel_requested", at: T(5), state: "cancel_requested", quantity: null, price: null }] : []),
    ...(server.phase === "cancelled" ? [{ kind: "cancel_requested", at: T(5), state: "cancel_requested", quantity: null, price: null }, { kind: "cancelled", at: T(6), state: "cancelled", quantity: null, price: null }, { kind: "released", at: T(7), state: "cancelled", quantity: null, price: null }] : []),
  ];
  const account = () => {
    const filled = server.phase === "filled";
    return {
      label: "Player 4F2A", buyingPower: filled ? "99429.64000000" : "99401.12200000", reserved: "0.00000000", cash: "100000.00000000", positionsValue: filled ? "570.36000000" : "0.00000000", equity: "100000.00000000",
      positions: filled ? [{ symbol: "AAPL", quantity: "3.00000000", avgCost: "190.12000000", price: "190.12000000", value: "570.36000000" }] : [],
      orders: server.phase === "none" ? [] : [order()], latestOrder: server.phase === "none" ? null : { orderId: ID, events: events() },
      fills: filled ? [{ fillId: `${ID}:0`, symbol: "AAPL", side: "buy", quantity: "3.00000000", price: "190.12000000", executedAt: T(2) }] : [], asOf: new Date().toISOString(),
    };
  };
  return { server, account };
}

async function mock(page: Page, state: ReturnType<typeof makeServer>): Promise<void> {
  const { server, account } = state;
  await page.route("**/api/leaderboard", (r) => r.fulfill(json({ rows: [{ accountId: "a", handle: "Player 4F2A", cash: "100000", positionsValue: "0", equity: "100000", rank: 1 }], total: 1, asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null })));
  await page.route("**/api/stock-prices", (r) => r.fulfill(json({ rows: [{ symbol: "AAPL", price: "190.12000000", asOf: "2026-10-16T20:00:00.000Z", stale: false, previousClose: { price: "187.00000000", asOf: "2026-10-15T20:00:00.000Z" } }, { symbol: "MSFT", price: "410.50000000", asOf: "2026-10-16T20:00:00.000Z", stale: false, previousClose: null }] })));
  await page.route("**/api/price/BTC-USD", (r) => r.fulfill(json({ symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() })));
  await page.route("**/api/orders/*/cancel", (r) => {
    server.cancels += 1;
    server.phase = "cancel_requested";
    return r.fulfill(json({ outcome: "requested", account: account() }));
  });
  await page.route("**/api/orders", (r) => {
    if (r.request().method() === "POST") {
      server.posts.push(r.request().postDataJSON());
      server.phase = "working";
      return r.fulfill(json({ orderId: ID, duplicate: false, account: account() }, 201));
    }
    const answer = account();
    // Each poll moves the order on one step, the way the lifecycle does.
    if (server.phase === "working" && server.fillOnNextPoll) server.phase = "filled";
    else if (server.phase === "cancel_requested") server.phase = "cancelled";
    return r.fulfill(json(answer));
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const wide = viewport.width >= 1024;
  test.describe(`the terminal at ${viewport.width}px`, () => {
    test.use({ viewport });

    async function openTicket(page: Page): Promise<void> {
      if (!wide) await page.getByRole("button", { name: "Trade" }).click();
    }

    test("header: equity from the account, rank only once ranked, the feeds told truthfully, the Player label and no change for today", async ({ page }) => {
      await mock(page, makeServer());
      await page.goto("/");
      const header = page.locator("header.bp-terminal__header");
      await expect(header.getByText("$100,000.00")).toBeVisible();
      await expect(header.getByText("#1 of 1")).toBeVisible();
      await expect(header.getByText("Stocks · end of day")).toBeVisible();
      await expect(header.getByText("Live", { exact: true })).toBeVisible();
      await expect(header.getByRole("img", { name: "Signed in as Player 4F2A" })).toBeVisible();
      await expect(header.getByText(/today/i)).toHaveCount(0);
    });

    test("the watchlist shows the move since the previous close only where both closes are stored", async ({ page }) => {
      await mock(page, makeServer());
      await page.goto("/");
      const aapl = page.getByRole("button", { name: /^AAPL/ });
      await expect(aapl).toContainText("▲ +1.67%"); // 190.12 against 187.00
      await expect(page.getByRole("button", { name: /^MSFT/ })).not.toContainText(/[▲▼]/);
    });

    test("ticket → order → step line → the fill appears in recent fills and in positions", async ({ page }) => {
      const state = makeServer();
      await mock(page, state);
      await page.goto("/");
      await page.getByRole("button", { name: /^AAPL/ }).click();
      await expect(page.getByText("No active order")).toBeVisible();
      await expect(page.getByText("Nothing filled yet")).toBeVisible();
      await openTicket(page);
      const ticket = wide ? page.getByRole("complementary", { name: "Order ticket" }) : page.getByRole("dialog", { name: "Order ticket" });
      await ticket.getByRole("button", { name: "Increase quantity" }).click();
      await ticket.getByRole("button", { name: "Increase quantity" }).click();
      await ticket.getByRole("button", { name: "Increase quantity" }).click();
      await expect(ticket.getByRole("button", { name: "Buy 3 AAPL · $570.36" })).toBeVisible();
      await ticket.getByRole("button", { name: "Buy 3 AAPL · $570.36" }).click();
      await expect.poll(() => state.server.posts.length).toBe(1);

      const steps = page.getByRole("list", { name: "Order steps" });
      await expect(steps).toContainText("Reserve");
      await expect(steps).toContainText("Settled");
      // the next poll books the fill: the step line completes, recent fills and positions gain it
      await expect(steps.getByText("3 of 3 filled")).toBeVisible({ timeout: 15_000 });
      await expect(steps.getByText("$28.52 back in buying power")).toBeVisible();
      await expect(page.getByRole("list", { name: "Recent fills" })).toContainText("Buy 3 AAPL");
      await expect(page.getByRole("list", { name: "Recent fills" })).toContainText("@ $190.12");
      const row = page.getByRole("row", { name: /AAPL/ });
      await expect(row).toContainText("$190.12");
      await expect(row).toContainText("$570.36");
      await expect(row).toContainText("+$0.00");
    });

    test("cancel from the panel: the request reads as 'cancel requested', not 'cancelled', and only then does it settle", async ({ page }) => {
      const state = makeServer({ fillOnNextPoll: false });
      state.server.phase = "working";
      await mock(page, state);
      await page.goto("/");
      const panel = page.getByRole("region", { name: "Active order" });
      await expect(panel.getByRole("button", { name: /Cancel order/ })).toBeVisible();
      await panel.getByRole("button", { name: /Cancel order/ }).click();
      await expect.poll(() => state.server.cancels).toBe(1);
      await expect(panel.locator(".bp-state")).toHaveText(/Cancel requested…/);
      await expect(panel.getByRole("button", { name: /Cancel order/ })).toHaveCount(0);
      await expect(panel.locator(".bp-state")).toHaveText(/Cancelled$/, { timeout: 15_000 });
    });

    test("shortcuts: B takes the ticket, Esc asks and confirms a cancel, ? lists them, and none fires while typing", async ({ page }) => {
      const state = makeServer({ fillOnNextPoll: false });
      state.server.phase = "working";
      await mock(page, state);
      await page.goto("/");
      await page.getByRole("button", { name: /^AAPL/ }).click();
      await page.locator("body").click({ position: { x: 5, y: 5 } });

      await page.keyboard.press("b");
      const quantity = page.getByRole("textbox", { name: "Quantity" }).locator("visible=true");
      await expect(quantity).toBeFocused();

      // while typing in the field: no shortcut fires, Esc included
      await page.keyboard.type("?b");
      await expect(quantity).toHaveValue("?b");
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog", { name: "Confirm cancel" })).toHaveCount(0);
      expect(state.server.cancels).toBe(0);

      // out of the field: Esc asks, Esc again keeps the order, and only the confirm cancels
      if (!wide) {
        await expect(page.getByRole("dialog", { name: "Order ticket" })).toBeHidden();
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // let the closed sheet hand focus back before the next key
      }
      if (wide) await quantity.blur(); // on a phone that Esc closed the ticket's sheet, and the field is gone
      await page.keyboard.press("Escape");
      const confirm = page.getByRole("alertdialog", { name: "Confirm cancel" });
      await expect(confirm).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(confirm).toHaveCount(0);
      expect(state.server.cancels).toBe(0);
      await page.keyboard.press("Escape");
      await confirm.getByRole("button", { name: "Yes, cancel it" }).click();
      await expect.poll(() => state.server.cancels).toBe(1);

      await page.keyboard.press("?");
      const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText("Esc");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });

    test("no accessibility violations in either theme with positions, a filled order and recent fills, and nothing overflows", async ({ page }) => {
      const state = makeServer();
      state.server.phase = "filled";
      await mock(page, state);
      await page.goto("/");
      await expect(page.getByRole("list", { name: "Recent fills" })).toBeVisible();
      for (const theme of ["dark", "light"]) {
        if (!(await page.locator("html").evaluate((el, t) => el.classList.contains("dark") === (t === "dark"), theme))) await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
        await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`), `axe in ${theme}`).toEqual([]);
        await shot(page, `terminal-${theme}`, viewport.width);
      }
      for (const control of await page.locator(".bp-stepper__button:visible, .bp-order__cancel:visible, .bp-avatar:visible").all()) {
        expect((await control.boundingBox())!.height, "a control shorter than 44 px").toBeGreaterThanOrEqual(43.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  });
}
