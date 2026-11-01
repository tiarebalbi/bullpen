import { expect, test, type Page } from "@playwright/test";

// The leaderboard's handle surface, as the terminal draws it for a visitor and for a signed-in player. Sign-in is not configured on a preview, so the
// routes are answered at the browser network layer with fixtures made here (never a page's data); the route's own rules are pinned by its unit tests.

test.use({ viewport: { width: 1440, height: 900 } });

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const row = (accountId: string, handle: string, rank: number) => ({ accountId, handle, cash: "100000", positionsValue: "0", equity: "100000", rank });
const ME = "11111111-1111-4111-8111-111111111111";

type Viewer = { accountId: string; handle: null | { status: "pending" | "review" | "approved" | "rejected"; approved: string | null } };

async function open(page: Page, who: { viewer?: Viewer; rows?: ReturnType<typeof row>[]; signedIn: boolean }): Promise<void> {
  const rows = who.rows ?? [row("22222222-2222-4222-8222-222222222222", "ada", 1), row(ME, "Player 4F2A", 2)];
  await page.route("**/api/leaderboard", (r) =>
    r.fulfill(json({ rows, total: rows.length, asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null, ...(who.viewer ? { viewer: who.viewer } : {}) })),
  );
  await page.route("**/api/stock-prices", (r) => r.fulfill(json({ rows: [] })));
  await page.route("**/api/price/BTC-USD", (r) => r.fulfill(json({ symbol: "BTC-USD", price: 65432.1, changePercent: 1.25, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() })));
  await page.route("**/api/orders", (r) =>
    who.signedIn
      ? r.fulfill(json({ label: "Player 4F2A", buyingPower: "100000.00000000", reserved: "0.00000000", cash: "100000.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], orders: [], latestOrder: null, fills: [], asOf: new Date().toISOString() }))
      : r.fulfill(json({ error: "sign-in-required", message: "Sign in with GitHub to place an order." }, 401)),
  );
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Players ranked by equity" })).toBeVisible();
}

const board = (page: Page) => page.getByRole("region", { name: "Leaderboard" });

test("a visitor sees one line under the table and no link", async ({ page }) => {
  await open(page, { signedIn: false, rows: [row("22222222-2222-4222-8222-222222222222", "ada", 1), row(ME, "Player 4F2A", 2)] });
  await expect(board(page).getByText("Players show as Player #### until they choose a handle and it’s approved.")).toBeVisible();
  await expect(board(page).getByRole("link", { name: /handle/i })).toHaveCount(0);
  await expect(board(page).getByText("You", { exact: true })).toHaveCount(0);
});

test("a signed-in player with no handle sees 'Set your handle →' to /account, and no visitor line", async ({ page }) => {
  await open(page, { signedIn: true, viewer: { accountId: ME, handle: null } });
  await expect(board(page).getByRole("link", { name: "Set your handle →" })).toHaveAttribute("href", "/account");
  await expect(board(page).getByText(/Players show as Player ####/)).toHaveCount(0);
});

test("the player's row is marked You, and says a handle in review is waiting, to them alone", async ({ page }) => {
  await open(page, { signedIn: true, viewer: { accountId: ME, handle: { status: "review", approved: null } } });
  await expect(board(page).getByRole("link", { name: "Change handle" })).toHaveAttribute("href", "/account");
  const mine = board(page).getByRole("listitem").filter({ hasText: "You" });
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("Player 4F2A");
  await expect(mine).toContainText("Your handle is waiting for review");
  await expect(board(page).getByRole("listitem").filter({ hasText: "ada" })).not.toContainText("waiting for review");
});

test("a handle that was not approved says so on the player's row: try another", async ({ page }) => {
  await open(page, { signedIn: true, viewer: { accountId: ME, handle: { status: "rejected", approved: null } } });
  await expect(board(page).getByRole("listitem").filter({ hasText: "You" })).toContainText("Your handle was not approved. Try another.");
});

test("an approved handle shows as everyone sees it, the row is still marked You, and the avatar and rank follow it", async ({ page }) => {
  await open(page, {
    signedIn: true,
    viewer: { accountId: ME, handle: { status: "approved", approved: "bull_run" } },
    rows: [row("22222222-2222-4222-8222-222222222222", "ada", 1), row(ME, "bull_run", 2)],
  });
  const mine = board(page).getByRole("listitem").filter({ hasText: "You" });
  await expect(mine).toContainText("bull_run");
  await expect(mine.getByTestId("leaderboard-own-note")).toHaveCount(0);
  const header = page.locator("header.bp-terminal__header");
  await expect(header.getByText("#2 of 2")).toBeVisible();
  await expect(header.locator(".bp-avatar__tile")).toHaveText("BU");
});

test("the header link has a tap target of at least 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { signedIn: true, viewer: { accountId: ME, handle: null } });
  const box = await board(page).getByRole("link", { name: "Set your handle →" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
