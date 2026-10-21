import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const ledger = JSON.parse(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8")) as Array<{ service: string }>;
// The landing leaves Redis and Lambda off (they stay in the ledger file): the count it shows is the ledger without them.
const OFF_LANDING = new Set(["upstash-redis", "aws-lambda"]);
const SHOWN_ALLOWANCES = ledger.filter((a) => !OFF_LANDING.has(a.service)).length;
const latestUsage = JSON.parse(readFileSync(join(repoRoot, "cost", "usage", readdirSync(join(repoRoot, "cost", "usage")).sort().pop()!), "utf8")) as { week: string };

async function mockPriceRoute(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 65432.1, changePercent: 2.34, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }),
  );
}

test.describe("Status grid (Decisions, Rules, What's defined, rule tiles, Cost, Free-tier usage)", () => {
  test.use({ viewport: { width: 1440, height: 1400 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
  });

  test("Decisions takes seven of twelve columns and two rows; Rules and What's defined stack in the other five", async ({ page }) => {
    const grid = await page.locator(".bp-status-grid").boundingBox();
    const [decisions, rules, defined] = await Promise.all(["#decisions", "#rules", "#defined"].map((s) => page.locator(s).boundingBox()));
    const column = (grid!.width - 11 * 16) / 12;
    expect(Math.abs(decisions!.width - (7 * column + 6 * 16))).toBeLessThan(2);
    expect(Math.abs(rules!.width - (5 * column + 4 * 16))).toBeLessThan(2);
    expect(Math.abs(rules!.x - defined!.x)).toBeLessThan(1);
    expect(Math.abs(rules!.y - decisions!.y)).toBeLessThan(2);
    expect(defined!.y).toBeGreaterThan(rules!.y + rules!.height - 1);
    // two rows tall: the decisions card ends where the stacked pair ends
    expect(Math.abs(decisions!.y + decisions!.height - (defined!.y + defined!.height))).toBeLessThan(2);
  });

  test("the eight rule tiles run four to a row, three columns each, below the pair", async ({ page }) => {
    const tiles = page.locator(".bp-tile");
    await expect(tiles).toHaveCount(8);
    const boxes = await tiles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    const ys = [...new Set(boxes.map((b) => Math.round(b.top)))];
    expect(ys).toHaveLength(2);
    expect(boxes.slice(0, 4).every((b) => Math.round(b.top) === ys[0])).toBe(true);
    const widths = boxes.map((b) => Math.round(b.width));
    expect(new Set(widths).size).toBe(1);
    const defined = await page.locator("#defined").boundingBox();
    expect(boxes[0]!.top).toBeGreaterThanOrEqual(defined!.y + defined!.height);
  });

  test("What's defined counts SYSTEM, COMPONENT and LIBRARY from structure.adl and gives the total", async ({ page }) => {
    const adl = readFileSync(join(repoRoot, "architecture", "adl", "structure.adl"), "utf8");
    const count = (kind: string): number => adl.split("\n").filter((l) => l.trim().startsWith(`DEFINE ${kind} `)).length;
    const defined = page.locator("#defined");
    for (const kind of ["SYSTEM", "COMPONENT", "LIBRARY"]) {
      await expect(defined.locator("div", { has: page.locator("dt", { hasText: new RegExp(`^${kind}$`) }) }).locator("dd").first()).toHaveText(String(count(kind)));
    }
    await expect(defined.getByText(`${count("SYSTEM") + count("COMPONENT") + count("LIBRARY")} entries`)).toBeVisible();
  });

  test("Cost is a 5/7 pair: spend is pending, the per-player slot says it arrives in Part 5, and no number stands in for either", async ({ page }) => {
    const [cost, usage] = await Promise.all([page.locator("#cost").boundingBox(), page.locator("#cost-usage").boundingBox()]);
    expect(Math.abs(cost!.y - usage!.y)).toBeLessThan(2);
    expect(Math.abs(cost!.width / usage!.width - 5 / 7)).toBeLessThan(0.02);
    const card = page.locator("#cost");
    await expect(card.getByText("pending", { exact: true })).toBeVisible();
    await expect(card.getByText("Spent this month")).toBeVisible();
    await expect(card.getByText("Arrives in Part 5", { exact: true })).toBeVisible();
    const text = await card.innerText();
    expect(text).not.toMatch(/\$\s?\d/);
  });

  test("the allowance count is the number of rows in the list, Redis and Lambda stay off, and Grafana is a Part 5 entry", async ({ page }) => {
    const card = page.locator("#cost");
    await expect(card.getByText(`${SHOWN_ALLOWANCES} free-tier allowances tracked`)).toBeVisible();
    const details = card.locator("details.bp-cost-all");
    await expect(details.locator("tbody tr").first()).toBeHidden();
    await details.locator("summary").click();
    await expect(details.locator("tbody tr")).toHaveCount(SHOWN_ALLOWANCES);
    await expect(details.locator("summary")).toHaveText(`All ${SHOWN_ALLOWANCES} allowances and sources`);
    const text = await details.innerText();
    expect(text).not.toMatch(/Redis|Lambda/);
    await expect(details.locator("tbody tr", { hasText: "Grafana Cloud" }).first()).toContainText("Part 5");
    for (const link of await details.locator("tbody a").all()) await expect(link).toHaveAttribute("href", /^https:\/\//);
  });

  test("Free-tier usage names the snapshot it read, says usage pending for every row, and draws no bar", async ({ page }) => {
    const usage = page.locator("#cost-usage");
    await expect(usage.getByText(latestUsage.week, { exact: false })).toBeVisible();
    const rows = usage.locator(".bp-usage-line");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) await expect(row.getByText("usage pending")).toBeVisible();
    await expect(usage.locator(".bp-meter")).toHaveCount(0);
    expect(await usage.locator(".bp-usage-line__track > *").count()).toBe(0);
    // only what runs today: nothing for services that arrive later or that nothing uses
    const text = await usage.innerText();
    expect(text).not.toMatch(/Redis|Lambda|Grafana|Queues|Workflows/);
  });

  test("carries none of the design's sample content", async ({ page }) => {
    const text = await page.locator(".bp-status-grid, .bp-cost-grid").evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText).join("\n"));
    for (const invented of ["$1.84", "$0.00", "Spent in September", "812k", "near limit", "as of Sep 25", "Superseded by ADR-005", "3 of 4 passing", "IEX", "Alpaca", "4 databases", "tbalbi"]) {
      expect(text).not.toContain(invented);
    }
  });

  test("nav links still resolve to their card", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Page sections" });
    for (const [name, id] of [["Decisions", "#decisions"], ["Rules", "#rules"], ["Cost", "#cost"]] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page.locator(id)).toBeInViewport();
    }
  });

  test("keyboard access to a Decisions row still opens and closes the modal and returns focus to the row", async ({ page }) => {
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

test.describe("Status grid at 390px", () => {
  test.use({ viewport: { width: 390, height: 1600 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
  });

  test("stacks Decisions, Rules and What's defined full width, then the tiles one per row, with no horizontal scroll", async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const boxes = await page.locator("#decisions, #rules, #defined, .bp-tile").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    expect(boxes).toHaveLength(11);
    for (const box of boxes) {
      expect(box.right).toBeLessThanOrEqual(391);
      expect(box.width).toBeGreaterThanOrEqual(300);
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 1);
  });

  test("the cost figures are two across and the usage rows stack under them", async ({ page }) => {
    const [spent, perPlayer] = await Promise.all([page.locator("#cost .bp-cost-tiles > div").nth(0).boundingBox(), page.locator("#cost .bp-cost-tiles > div").nth(1).boundingBox()]);
    expect(Math.abs(spent!.y - perPlayer!.y)).toBeLessThan(2);
    expect(perPlayer!.x).toBeGreaterThan(spent!.x);
    const [cost, usage] = await Promise.all([page.locator("#cost").boundingBox(), page.locator("#cost-usage").boundingBox()]);
    expect(usage!.y).toBeGreaterThan(cost!.y + cost!.height - 1);
  });
});
