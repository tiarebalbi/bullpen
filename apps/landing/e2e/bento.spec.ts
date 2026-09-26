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

test.describe("Status bento (Decisions, Rules, Cost, Free-tier usage)", () => {
  test.use({ viewport: { width: 1440, height: 1400 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
  });

  test("all four cards sit inside one bento frame, two per row", async ({ page }) => {
    const bento = page.locator(".bp-bento");
    await expect(bento).toBeVisible();

    const decisions = page.locator("#decisions");
    const rules = page.locator("#rules");
    const cost = page.locator("#cost");
    const usage = page.locator("#cost-usage");

    // Every card is a direct-ish descendant of .bp-bento -- confirmed by
    // each id resolving inside it, not merely existing on the page.
    for (const card of [decisions, rules, cost, usage]) {
      await expect(bento.locator("#" + (await card.getAttribute("id")))).toHaveCount(1);
    }

    const [decisionsBox, rulesBox, costBox, usageBox] = await Promise.all(
      [decisions, rules, cost, usage].map((l) => l.boundingBox()),
    );
    expect(Math.abs(decisionsBox!.y - rulesBox!.y)).toBeLessThan(2);
    expect(Math.abs(costBox!.y - usageBox!.y)).toBeLessThan(2);
    expect(decisionsBox!.x).toBeLessThan(rulesBox!.x);
    expect(costBox!.y).toBeGreaterThan(decisionsBox!.y);
  });

  test("the raw check:arch terminal block is gone", async ({ page }) => {
    await expect(page.locator(".bp-check-arch")).toHaveCount(0);
  });

  test("Rules shows exactly four real rule mini-cards with real ADL/check text, not invented pseudocode", async ({
    page,
  }) => {
    const ruleCards = page.locator("#rules .bp-rule-card");
    await expect(ruleCards).toHaveCount(4);

    const text = await page.locator("#rules").innerText();
    expect(text).toContain("DEFINED");
    expect(text).toMatch(/NEVER DEPEND ON/);
    expect(text).toContain("architecture/adl/structure.adl");
    expect(text).toContain("architecture/fitness/src/budget-check.ts");

    // None of the design's fictional rule content.
    expect(text).not.toContain("services own their data");
    expect(text).not.toContain("Schema grant audit");
    expect(text).not.toMatch(/p95 2\.4s/);
  });

  test("Decisions and Rules cards carry no invented sample content from the design mockup", async ({ page }) => {
    const bentoText = await page.locator(".bp-bento").innerText();
    for (const invented of [
      "ADR-008",
      "ADR-009",
      "Superseded by ADR-005",
      "$1.84",
      "3 of 4 passing",
      "812k",
      "near limit",
      "as of Sep 25, 14:00",
    ]) {
      expect(bentoText).not.toContain(invented);
    }
  });

  test("Cost card shows a real allowance count and links to the full allowances table", async ({ page }) => {
    const cost = page.locator("#cost");
    await expect(cost.getByText("22", { exact: true })).toBeVisible();
    await expect(cost.getByText("Part 5", { exact: true })).toBeVisible();

    const details = cost.locator("details.bp-bento__more");
    await expect(details.locator("table tbody tr").first()).toBeHidden();
    await details.locator("summary").click();
    await expect(details.locator("table tbody tr").first()).toBeVisible();
    // Filtered to Part 1's real allowances (Vercel Hobby's 7 metrics +
    // CoinGecko Demo's 2); the other 13 show up grouped in "Arrives in
    // later parts" below, not as individual rows.
    await expect(details.locator("table tbody tr")).toHaveCount(9);
    await expect(details.locator(".bp-bento__later li")).toHaveCount(6);
  });

  test("Free-tier usage shows the real pending state for every real metric, with no bars", async ({ page }) => {
    const usage = page.locator("#cost-usage");
    await expect(usage.getByText("2026-w40", { exact: false })).toBeVisible();
    // Filtered to Part 1's real services (Vercel Hobby + CoinGecko Demo) --
    // Vercel Queues/Workflows rows belong to services that don't exist yet.
    await expect(usage.locator(".bp-usage-row")).toHaveCount(6);
    await expect(usage.getByText("usage pending").first()).toBeVisible();
    await expect(usage.locator(".bp-meter")).toHaveCount(0);
  });

  test("nav links still resolve to their card (Decisions and Rules share a row, Cost and Usage share the next)", async ({
    page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Page sections" });
    await nav.getByRole("link", { name: "Decisions" }).click();
    await expect(page.locator("#decisions")).toBeInViewport();
    await nav.getByRole("link", { name: "Rules" }).click();
    await expect(page.locator("#rules")).toBeInViewport();
    await nav.getByRole("link", { name: "Cost" }).click();
    await expect(page.locator("#cost")).toBeInViewport();
  });

  test("keyboard access to a Decisions row inside the denser card still opens and closes the modal correctly", async ({
    page,
  }) => {
    const firstRow = page.locator("#decisions .bp-decisions-row").first();
    await firstRow.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(firstRow).toBeFocused();
  });
});

test.describe("Status bento at 390px", () => {
  test.use({ viewport: { width: 390, height: 1600 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
  });

  test("stacks all four cards full-width, one per row, with no squeezed card", async ({ page }) => {
    const bento = page.locator(".bp-bento");
    const bentoBox = await bento.boundingBox();
    expect(bentoBox!.width).toBeGreaterThanOrEqual(350);

    const cards = page.locator(".bp-bento__card");
    await expect(cards).toHaveCount(4);
    const boxes = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    for (const box of boxes) {
      expect(box.right).toBeLessThanOrEqual(391);
      // The anti-214px guard: a squeezed card would be much narrower than
      // this even accounting for the frame's own padding.
      expect(box.width).toBeGreaterThanOrEqual(300);
    }
    // Stacked in DOM order: each card's top is at or below the previous one's bottom.
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 1);
    }
  });
});
