import { expect, test, type Page } from "@playwright/test";

async function mockPriceRoute(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        symbol: "BTC-USD",
        price: 65432.1,
        changePercent: 2.34,
        time: new Date().toISOString(),
        source: "coingecko",
        fetchedAt: new Date().toISOString(),
      }),
    }),
  );
}

test.describe("Decisions", () => {
  test.use({ viewport: { width: 1440, height: 1200 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
    // page.goto resolves on the browser's "load" event, which is not the
    // same moment React finishes hydrating this page's heaviest client
    // component (the React Flow Architecture Explorer). A CI trace of the
    // hashchange test below showed window.location.hash being set (via
    // page.evaluate) essentially the instant goto resolved, then *nothing*
    // -- no error, no repaint, for the full 10s timeout -- consistent with
    // DecisionsList's useSyncExternalStore hashchange listener (see
    // DecisionsList.tsx) not being attached yet when that one-shot event
    // fired, so it was simply never caught. Waiting for the network to go
    // idle gives the client bundle real room to finish executing first.
    await page.waitForLoadState("networkidle");
  });

  test("the list shows id, summary, part and status chip for every real ADR", async ({ page }) => {
    const decisions = page.locator("#decisions");
    const row = decisions.locator(".bp-decisions-row", { hasText: "ADR-0001" });
    await expect(row.locator(".bp-decisions-row__id")).toHaveText("ADR-0001");
    await expect(row.locator(".bp-decisions-row__summary")).toHaveText("Vercel Hobby, Turborepo and TypeScript");
    await expect(row.locator(".bp-decisions-row__meta")).toHaveText("Part 1");
    await expect(row.getByText("Accepted")).toBeVisible();

    // ADR-0004 is reserved but not written -- must not appear.
    await expect(decisions.getByText("ADR-0004")).toHaveCount(0);
  });

  test("clicking a row opens the modal with the ADR's full body", async ({ page }) => {
    const decisions = page.locator("#decisions");
    await decisions.locator(".bp-decisions-row", { hasText: "ADR-0001" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("ADR-0001", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Stack" })).toBeVisible();
    await expect(dialog.getByText("Context", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Decision", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Consequences", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Alternatives", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Links", { exact: true })).toBeVisible();
    // The rendered body has real structure (lists), not literal Markdown syntax.
    await expect(dialog.locator(".bp-decision-modal__prose li").first()).toBeVisible();

    await expect(page).toHaveURL(/#adr-0001$/);
  });

  test("Escape closes the modal, clears the hash and returns focus to the row that opened it", async ({ page }) => {
    const row = page.locator("#decisions").locator(".bp-decisions-row", { hasText: "ADR-0002" });
    await row.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/#adr-0002/);
    await expect(row).toBeFocused();
  });

  test("the close button also closes it and returns focus", async ({ page }) => {
    const row = page.locator("#decisions").locator(".bp-decisions-row", { hasText: "ADR-0003" });
    await row.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeFocused();
  });

  test("clicking the backdrop closes it", async ({ page }) => {
    await page.locator("#decisions").locator(".bp-decisions-row", { hasText: "ADR-0001" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Click well outside the dialog's own box -- lands on ::backdrop.
    await page.mouse.click(10, 10);
    await expect(dialog).toBeHidden();
  });

  test("navigating to an ADR hash from elsewhere on the page opens it without a reload", async ({ page }) => {
    // The Architecture Explorer's side panel links to the same #adr-000N
    // hashes; this exercises that same-page hashchange path directly.
    await page.evaluate(() => {
      window.location.hash = "#adr-0003";
    });
    const dialog = page.getByRole("dialog");
    // A longer timeout, not a weaker assertion: this page also hydrates the
    // React Flow Architecture Explorer, and on a loaded CI runner that
    // hydration can occasionally push the useSyncExternalStore hash resync
    // (see DecisionsList.tsx) past Playwright's default 5s.
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("heading", { name: "Monorepo" })).toBeVisible();
  });

  test("Tab cycles focus within the open dialog", async ({ page }) => {
    await page.locator("#decisions").locator(".bp-decisions-row", { hasText: "ADR-0001" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const activeIsInsideDialog = await page.evaluate(() => {
        const dlg = document.querySelector("dialog[open]");
        return Boolean(dlg && document.activeElement && dlg.contains(document.activeElement));
      });
      expect(activeIsInsideDialog).toBe(true);
    }
  });
});

// A real cold load, in its own describe so no beforeEach navigates first --
// the outer "Decisions" suite's beforeEach already loads "/" for every test,
// so a same-suite test doing page.goto("/#adr-0002") second is only a
// same-document fragment change (no reload), not an actual deep link. That
// mistake meant this test never verified the arrives-with-hash-in-the-URL
// path (useSyncExternalStore's getServerSnapshot/getSnapshot resync in
// DecisionsList.tsx, distinct from the hashchange-event path the sibling
// "navigating ... without a reload" test above covers) -- confirmed via a
// CI trace showing the two goto() calls, one from beforeEach and one from
// the test itself, both against an already-loaded page.
test.describe("Decisions, cold load", () => {
  test.use({ viewport: { width: 1440, height: 1200 } });

  test("a deep link opens the modal on the very first load", async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/#adr-0002");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("heading", { name: "Why distribute at all" })).toBeVisible();
  });
});

test.describe("Decisions at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
  });

  test("the row list and modal fit the viewport with no horizontal overflow", async ({ page }) => {
    const decisions = page.locator("#decisions");
    const right = await decisions.evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(391);

    await decisions.locator(".bp-decisions-row", { hasText: "ADR-0001" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox!.width).toBeLessThanOrEqual(390);
  });
});
