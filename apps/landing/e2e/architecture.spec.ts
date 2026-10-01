import { expect, test, type Page } from "@playwright/test";
import { expectedOpeningPart } from "./builtParts.js";

// The "Live prices" strip isn't relevant to these tests but renders on the
// same page; mock it so it never fails a request and never logs a console
// error that would be confusing noise here.
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

test.describe("Architecture Explorer", () => {
  test.use({ viewport: { width: 1440, height: 1200 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
  });

  test("opens on the latest built part, read from the explorer content, and shows it as built", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const opening = expectedOpeningPart();
    const scrubber = architecture.getByRole("group", { name: "Series part" });

    await expect(architecture.getByText(`Overview · Part ${opening}`)).toBeVisible();
    await expect(scrubber.getByRole("button", { name: `PART ${opening}` })).toHaveAttribute("aria-current", "step");
    await expect(architecture.getByText("Built", { exact: true }).first()).toBeVisible();
  });

  test("a part the reader picks stays picked, instead of snapping back to the default", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });

    await scrubber.getByRole("button", { name: "PART 1" }).click();
    await expect(architecture.getByText("Overview · Part 1")).toBeVisible();
    await page.waitForTimeout(600);
    await expect(scrubber.getByRole("button", { name: "PART 1" })).toHaveAttribute("aria-current", "step");
    await expect(architecture.getByText("Overview · Part 1")).toBeVisible();
  });

  test("scrubbing from part to part updates the summary and status chip", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });

    await scrubber.getByRole("button", { name: "PART 1" }).click();
    await expect(architecture.getByText("Overview · Part 1")).toBeVisible();
    await expect(architecture.getByText("Built", { exact: true }).first()).toBeVisible();

    await scrubber.getByRole("button", { name: "PART 2" }).click();

    // Part 2 is built: same runtime nodes, the rules now fail a build.
    await expect(architecture.getByText("Overview · Part 2")).toBeVisible();
    await expect(architecture.getByText("Built", { exact: true }).first()).toBeVisible();

    await scrubber.getByRole("button", { name: "PART 3" }).click();

    await expect(architecture.getByText("Overview · Part 3")).toBeVisible();
    await expect(architecture.getByText("Planned", { exact: true }).first()).toBeVisible();
  });

  test("selecting a node fills the side panel with its purpose, ADRs and cost", async ({ page }) => {
    const architecture = page.locator("#architecture");
    await architecture.getByRole("button", { name: "Bullpen Trading App, App" }).click();

    const panel = architecture.getByLabel("Details");
    await expect(panel.getByText("Bullpen Trading App")).toBeVisible();
    await expect(panel.getByText(/players view live prices/)).toBeVisible();
    await expect(panel.getByText("ADR-0001")).toBeVisible();
    await expect(panel.getByText("ADR-0003")).toBeVisible();
    await expect(panel.getByText("Free tier (Hobby)")).toBeVisible();

    await panel.getByRole("button", { name: "Close details" }).click();
    await expect(panel.getByText("Select a node for its purpose")).toBeVisible();
  });

  test("a node with no recorded ADR yet shows the pending copy", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    await architecture.getByRole("button", { name: "Prices Service, Service" }).click();
    const panel = architecture.getByLabel("Details");
    await expect(panel.getByText("ADR pending: written before this part ships.")).toBeVisible();
  });

  test("the sync/async toggle hides the legend's edge-type entries", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const toggle = architecture.getByRole("switch", { name: "Sync vs async" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(architecture.getByText("Synchronous", { exact: true })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(architecture.getByText("Synchronous", { exact: true })).toBeHidden();
  });

  test("the data-ownership toggle reveals a database pill on nodes that own data", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    await expect(architecture.getByText("prices-service_db")).toBeHidden();
    await architecture.getByRole("switch", { name: "Data ownership" }).click();
    await expect(architecture.getByText("prices-service_db")).toBeVisible();
  });

  test("scrubbing to a part with more nodes than the initial one refits the viewport, not just the DOM", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });

    // The opening part (a built one, with only its few real nodes) mounts
    // and fits the viewport first. Part 6 has far more nodes spread
    // further out; without a refit on part change, React Flow's `fitView`
    // only ever fires once on mount, so Part 6's outer nodes render
    // outside that stale, smaller viewport -- present in the DOM, but not
    // actually visible on screen.
    await scrubber.getByRole("button", { name: "PART 6" }).click();
    // Let both the node-settling animation and fitView's own pan/zoom
    // transition finish before measuring -- otherwise this reads
    // mid-animation, moving numbers.
    await page.waitForTimeout(1200);

    // Captured after the click (which scrolls the section into view) --
    // measuring it beforehand would compare against a stale scroll offset.
    // Measured against React Flow's own viewport element (not the outer
    // canvas panel, which also includes the legend and its own padding).
    const canvasBox = (await architecture.locator(".react-flow").boundingBox())!;

    for (const name of ["Leaderboard Service, Service", "Ledger Service, Service", "Stock data provider, External"]) {
      const box = await architecture.getByRole("button", { name }).boundingBox();
      expect(box, `${name} should be in the DOM`).not.toBeNull();
      expect(box!.x, `${name} left edge within canvas`).toBeGreaterThanOrEqual(canvasBox.x);
      expect(box!.y, `${name} top edge within canvas`).toBeGreaterThanOrEqual(canvasBox.y);
      expect(box!.x + box!.width, `${name} right edge within canvas`).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
      expect(box!.y + box!.height, `${name} bottom edge within canvas`).toBeLessThanOrEqual(canvasBox.y + canvasBox.height);
    }
  });

  test("a planned part ghosts nodes and edges the built system doesn't have yet", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    // "Prices Service" is new to Part 3's prediction: ghosted, dashed, tagged PLANNED.
    const pricesService = architecture.getByRole("button", { name: "Prices Service, Service" });
    await expect(pricesService.getByText("PLANNED")).toBeVisible();

    // "Bullpen Trading App" already exists in the real, built Part 1: never ghosted.
    const tradingApp = architecture.getByRole("button", { name: "Bullpen Trading App, App" });
    await expect(tradingApp.getByText("PLANNED")).toHaveCount(0);
  });

  test("the quanta toggle groups a db-owning service with the database it owns", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    const toggle = architecture.getByRole("switch", { name: "Group by quanta" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const groupLabel = architecture.locator(".bp-arch-group__label", { hasText: "Prices Service" });
    await expect(groupLabel).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(groupLabel).toHaveCount(0);
  });

  test("the group rect visually contains its member nodes, including after a resize", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    const groupRect = architecture.locator(".bp-arch-group__label", { hasText: "Prices Service" }).locator("..");
    const service = architecture.getByRole("button", { name: "Prices Service, Service" });
    const database = architecture.getByRole("button", { name: "Prices Database, Data" });

    async function expectGroupContainsMembers() {
      const groupBox = (await groupRect.boundingBox())!;
      const serviceBox = (await service.boundingBox())!;
      const dbBox = (await database.boundingBox())!;
      for (const memberBox of [serviceBox, dbBox]) {
        expect(memberBox.x).toBeGreaterThanOrEqual(groupBox.x - 1);
        expect(memberBox.y).toBeGreaterThanOrEqual(groupBox.y - 1);
        expect(memberBox.x + memberBox.width).toBeLessThanOrEqual(groupBox.x + groupBox.width + 1);
        expect(memberBox.y + memberBox.height).toBeLessThanOrEqual(groupBox.y + groupBox.height + 1);
      }
    }

    await expectGroupContainsMembers();

    // The bug this regresses: the group rect was a separately
    // absolutely-positioned overlay div using raw, untransformed data
    // coordinates, so it didn't move with the canvas's own pan/zoom
    // transform (which React Flow's fitView recalculates whenever the
    // container resizes) -- it drifted away from its member nodes. Real
    // React Flow parent/child nodes (sub-flows) share that transform.
    await page.setViewportSize({ width: 1000, height: 900 });
    await expectGroupContainsMembers();
  });

  test("moving from part 2 to part 3 shows what was added and removed", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    const panel = architecture.getByLabel("Details");
    await expect(panel.getByText("Prices Service")).toBeVisible();
    await expect(panel.getByText("Price Snapshot Service")).toBeVisible();
  });

  test("Follow a request plays through steps and can be paused, stepped and exited", async ({ page }) => {
    const architecture = page.locator("#architecture");
    await architecture.getByRole("button", { name: /Follow a price request/i }).click();

    await expect(architecture.getByRole("status")).toContainText("STEP 1 OF 3");

    await architecture.getByRole("button", { name: "Pause" }).click();
    await expect(architecture.getByRole("status")).toContainText("STEP 1 OF 3");

    await architecture.getByRole("button", { name: "Next step" }).click();
    await expect(architecture.getByRole("status")).toContainText("STEP 2 OF 3");

    await architecture.getByRole("button", { name: "Step 3" }).click();
    await expect(architecture.getByRole("status")).toContainText("STEP 3 OF 3");

    await architecture.getByRole("button", { name: "Exit" }).click();
    await expect(architecture.getByRole("status")).toHaveCount(0);
  });

  test("respects prefers-reduced-motion: no motion-only classes on a changed node", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();

    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    const removedNode = architecture.getByRole("button", { name: "Price Snapshot Service, Service" });
    await expect(removedNode).toHaveClass(/bp-arch-node--removed-reduced/);
    await expect(removedNode).not.toHaveClass(/bp-arch-node--removed(?!-reduced)/);
  });

  test("Play the series advances through parts on its own and can be paused", async ({ page }) => {
    const architecture = page.locator("#architecture");
    await architecture.getByRole("button", { name: "Play the series" }).click();
    await expect(architecture.getByRole("button", { name: "Pause the series" })).toBeVisible();

    await expect(architecture.getByText("Overview · Part 2")).toBeVisible({ timeout: 5000 });

    await architecture.getByRole("button", { name: "Pause the series" }).click();
    await expect(architecture.getByRole("button", { name: "Play the series" })).toBeVisible();
  });
});

test.describe("Architecture Explorer at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
  });

  test("the canvas and side panel stack instead of squeezing into two columns", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const canvasBox = await architecture.locator(".bp-arch-explorer__canvas").boundingBox();
    const panelBox = await architecture.getByLabel("Details").boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(panelBox).not.toBeNull();

    // Stacked: the canvas is (close to) full viewport width, and the panel
    // sits below it rather than squeezed into a narrow second column.
    expect(canvasBox!.width).toBeGreaterThan(300);
    expect(panelBox!.width).toBeGreaterThan(300);
    expect(panelBox!.y).toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height - 1);
  });

  test("selecting a node still works and doesn't cause horizontal overflow", async ({ page }) => {
    const architecture = page.locator("#architecture");
    await architecture.getByRole("button", { name: "Bullpen Trading App, App" }).click();

    const panel = architecture.getByLabel("Details");
    await expect(panel.getByText("Bullpen Trading App")).toBeVisible();

    const right = await architecture.evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(391);
  });
});
