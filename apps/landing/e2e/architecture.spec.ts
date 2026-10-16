import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
    await expect(panel.getByText(/It owns orders, the ledger, positions and the leaderboard view/)).toBeVisible();
    for (const adr of ["ADR-0001", "ADR-0003", "ADR-0012", "ADR-0014"]) await expect(panel.getByText(adr)).toBeVisible();
    await expect(panel.getByText("Free tier (Hobby)")).toBeVisible();

    await panel.getByRole("button", { name: "Close details" }).click();
    await expect(panel.getByText("Select a node for its purpose")).toBeVisible();
  });

  test("a node with no recorded ADR yet shows the pending copy", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 4" }).click();

    await architecture.getByRole("button", { name: "Order Saga, Infra" }).click();
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

  test("the data-ownership toggle shows who owns each schema, and what each database role may do", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    const toggle = architecture.getByRole("switch", { name: "Data ownership" });
    await expect(architecture.getByTestId("owner-legend")).toHaveCount(0);
    await expect(architecture.getByText("trading_owner · read/write")).toHaveCount(0);

    await toggle.click();
    const legend = architecture.getByTestId("owner-legend");
    await expect(legend).toContainText("Bullpen Trading App");
    await expect(legend).toContainText("Market Data Service");
    for (const label of ["trading_owner · read/write", "trading_owner · read only", "market_data_owner · write"]) {
      await expect(architecture.getByText(label), label).toBeVisible();
    }

    await toggle.click();
    await expect(architecture.getByTestId("owner-legend")).toHaveCount(0);
    await expect(architecture.getByText("market_data_owner · write")).toHaveCount(0);
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

    for (const name of ["Market Open Queue, Infra", "Order Saga, Infra", "Bullpen Trading App, App"]) {
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
    await scrubber.getByRole("button", { name: "PART 4" }).click();

    // "Order Saga" is new to Part 4's plan: ghosted, dashed, tagged PLANNED.
    const orderSaga = architecture.getByRole("button", { name: "Order Saga, Infra" });
    await expect(orderSaga.getByText("PLANNED")).toBeVisible();

    // "Bullpen Trading App" already exists in the real, built Part 1: never ghosted.
    const tradingApp = architecture.getByRole("button", { name: "Bullpen Trading App, App" });
    await expect(tradingApp.getByText("PLANNED")).toHaveCount(0);
  });

  test("the quanta toggle draws the box around what ships in one release", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    const toggle = architecture.getByRole("switch", { name: "Group by quanta" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const groupLabel = architecture.locator(".bp-arch-group__label", { hasText: "One Vercel project, shared release" });
    await expect(groupLabel).toBeVisible();
    await expect(architecture.locator(".bp-arch-group__label", { hasText: "One Neon database" })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(groupLabel).toHaveCount(0);
  });

  test("the group rect visually contains its member nodes, including after a resize", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    const groupRect = architecture.locator(".bp-arch-group__label", { hasText: "One Vercel project, shared release" }).locator("..");
    const service = architecture.getByRole("button", { name: "Market Data Service, Service" });
    const database = architecture.getByRole("button", { name: "Bullpen Trading App, App" });

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

    // Let the node-settling animation and fitView's transition finish before measuring.
    await page.waitForTimeout(1200);
    await expectGroupContainsMembers();

    // The bug this regresses: the group rect was a separately
    // absolutely-positioned overlay div using raw, untransformed data
    // coordinates, so it didn't move with the canvas's own pan/zoom
    // transform (which React Flow's fitView recalculates whenever the
    // container resizes) -- it drifted away from its member nodes. Real
    // React Flow parent/child nodes (sub-flows) share that transform.
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForTimeout(1200);
    await expectGroupContainsMembers();
  });

  test("moving from part 2 to part 3 shows what was added and removed", async ({ page }) => {
    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 2" }).click();
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    // The side panel keeps a summary; what changed is in the sheet its button opens.
    await architecture.getByLabel("Details").getByRole("button", { name: "What changed" }).click();
    const panel = page.getByRole("dialog", { name: /in detail/ });
    await expect(panel.getByText(/^\+?\s*Market Data Service$/)).toBeVisible();
    await expect(panel.getByText("Bullpen Database")).toBeVisible();
    await expect(panel.getByText("Price Snapshot Service (moved into Market Data Service)")).toBeVisible();
    // The old prediction's services were never built, so they are not something Part 3 added: they appear once, under "Predicted, not built".
    await expect(panel.getByText("Predicted in week one, not built")).toBeVisible();
    await expect(panel.getByText("Prices Service")).toHaveCount(1);
  });

  test("Follow a request plays through steps and can be paused, stepped and exited", async ({ page }) => {
    const architecture = page.locator("#architecture");
    await architecture.getByRole("button", { name: /Follow a price request/i }).click();

    await expect(architecture.getByRole("status")).toContainText("STEP 1 OF 4");

    await architecture.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(architecture.getByRole("status")).toContainText("STEP 1 OF 4");

    await architecture.getByRole("button", { name: "Next step" }).click();
    await expect(architecture.getByRole("status")).toContainText("STEP 2 OF 4");

    await architecture.getByRole("button", { name: "Step 4" }).click();
    await expect(architecture.getByRole("status")).toContainText("STEP 4 OF 4");

    await architecture.getByRole("button", { name: "Exit" }).click();
    await expect(architecture.getByRole("status")).toHaveCount(0);
  });

  test("respects prefers-reduced-motion: no motion-only classes on a changed node", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();

    const architecture = page.locator("#architecture");
    const scrubber = architecture.getByRole("group", { name: "Series part" });
    await scrubber.getByRole("button", { name: "PART 2" }).click();
    await scrubber.getByRole("button", { name: "PART 3" }).click();

    // Under reduced motion no node carries a class that moves: only the still ones (`-reduced`) may appear, at any moment of the change.
    for (const part of ["PART 2", "PART 3", "PART 4", "PART 3"]) {
      await scrubber.getByRole("button", { name: part }).click();
      const classes = await architecture.locator(".react-flow__node-archNode [role=button]").evaluateAll((els) => els.map((e) => e.className));
      for (const className of classes) expect(className, `after moving to ${part}`).not.toMatch(/bp-arch-node--(added|removed)(?!-reduced)|bp-arch-node__(ring|strike)(?!--reduced)/);
    }
  });

  test("Play the series advances through parts on its own and can be paused", async ({ page }) => {
    const architecture = page.locator("#architecture");
    await architecture.getByRole("button", { name: "Play the series" }).click();
    await expect(architecture.getByRole("button", { name: "Pause the series" })).toBeVisible();

    // The series opens on its latest built part, Part 3, so the first step on is Part 4.
    await expect(architecture.getByText("Overview · Part 4")).toBeVisible({ timeout: 5000 });

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

// Built nodes carry forward into the planned parts (ADR-0011): the Part 1
// analytics cards and their four edges stay on the map after Part 1, marked
// as built, so scrubbing forward never shows analytics removed.
const ANALYTICS_CARDS = ["Google Analytics 4, External", "Microsoft Clarity, External"] as const;
const ANALYTICS_EDGES = [
  "landing-to-google-analytics",
  "landing-to-microsoft-clarity",
  "trading-app-to-google-analytics",
  "trading-app-to-microsoft-clarity",
] as const;

// Part 2 added and removed no node: its panel says so, then lists each node or connection that gained
// controls once, as chips. A chip opens a popover with the model's description, so the panel stays short.
const PART_2_MOMENT = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "architecture", "calm", "moments", "part-02.architecture.json"), "utf8")) as {
  nodes: Array<{ "unique-id": string; controls?: Record<string, { description?: string }> }>;
};
const APP_BOUNDARIES = PART_2_MOMENT.nodes.find((n) => n["unique-id"] === "landing-app")!.controls!["app-boundaries"]!.description!;
const INTRO = "No services or connections were added or removed in Part 2. What changed are the rules around them:";
const CHIPS = ["App boundaries", "Explorer matches model", "Secret containment", "Call budget"] as const;

async function openPart2Panel(page: Page): Promise<Locator> {
  await mockPriceRoute(page);
  await page.goto("/");
  const architecture = page.locator("#architecture");
  await architecture.getByRole("group", { name: "Series part" }).getByRole("button", { name: "PART 2" }).click();
  const side = architecture.getByLabel("Details");
  await expect(side.getByText("What changed in Part 2")).toBeVisible();
  // What changed is in the bottom sheet the panel's button opens: the tests below read it there.
  await side.getByRole("button", { name: "What changed" }).click();
  return page.getByRole("dialog", { name: /in detail/ });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`What changed in Part 2 at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("says nothing was added or removed, then lists the controls as chips and the ADR, never Part 1's fallback", async ({ page }) => {
      const panel = await openPart2Panel(page);
      await expect(panel.getByText(INTRO)).toBeVisible();
      await expect(panel.getByText(/starting point/)).toHaveCount(0);
      for (const name of CHIPS) await expect(panel.getByRole("button", { name }).first()).toBeVisible();
      await expect(panel.getByRole("link", { name: /^ADR-0009 — / })).toBeVisible();
    });

    test("shows each node once, and no description inline until a chip is pressed", async ({ page }) => {
      const panel = await openPart2Panel(page);
      await expect(panel.getByText("Bullpen Landing", { exact: true })).toHaveCount(1);
      // The Landing and the Trading App share this control, so its text sits in two popovers.
      for (const description of await panel.getByText(APP_BOUNDARIES).all()) await expect(description).toBeHidden();
      await expect(panel.locator('[role="region"]:not([hidden])')).toHaveCount(0);
    });

    test("opens a popover with the model's description and the key, and wires aria-expanded and aria-controls", async ({ page }) => {
      const panel = await openPart2Panel(page);
      const chip = panel.getByRole("button", { name: "App boundaries" }).first();
      await expect(chip).toHaveAttribute("aria-expanded", "false");
      await chip.click();

      const popover = page.getByRole("region", { name: "App boundaries" });
      await expect(popover).toBeVisible();
      await expect(chip).toHaveAttribute("aria-expanded", "true");
      await expect(chip).toHaveAttribute("aria-controls", (await popover.getAttribute("id"))!);
      await expect(popover.getByText(APP_BOUNDARIES)).toBeVisible();
      await expect(popover.getByText("app-boundaries", { exact: true })).toBeVisible();
    });

    test("opens with Enter and Space, closes on Esc, and focus returns to the chip", async ({ page }) => {
      const panel = await openPart2Panel(page);
      const chip = panel.getByRole("button", { name: "App boundaries" }).first();
      const popover = page.getByRole("region", { name: "App boundaries" });

      await chip.focus();
      await page.keyboard.press("Enter");
      await expect(popover).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
      await expect(chip).toBeFocused();

      await page.keyboard.press("Space");
      await expect(popover).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(chip).toBeFocused();
      await expect(chip).toHaveAttribute("aria-expanded", "false");
    });

    test("opening a second chip with the mouse closes the first, and a press outside closes the open one", async ({ page }) => {
      const panel = await openPart2Panel(page);
      await panel.getByRole("button", { name: "App boundaries" }).first().click();
      await expect(page.getByRole("region", { name: "App boundaries" })).toBeVisible();

      // The description sits in the flow, under the chips, so the next chip is still there to click.
      await panel.getByRole("button", { name: "Call budget" }).click();
      await expect(page.getByRole("region", { name: "Call budget" })).toBeVisible();
      await expect(page.getByRole("region", { name: "App boundaries" })).toHaveCount(0);

      // A press outside the popover but inside the sheet: outside the sheet it would close the sheet, which is its own test.
      await panel.locator(".bp-traffic-sheet__head").click({ position: { x: 6, y: 6 } });
      await expect(page.getByRole("region", { name: "Call budget" })).toHaveCount(0);
    });

    test("opening a second chip with the keyboard closes the first", async ({ page }) => {
      const panel = await openPart2Panel(page);
      await panel.getByRole("button", { name: "App boundaries" }).first().click();
      await expect(page.getByRole("region", { name: "App boundaries" })).toBeVisible();
      await panel.getByRole("button", { name: "Call budget" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("region", { name: "Call budget" })).toBeVisible();
      await expect(page.getByRole("region", { name: "App boundaries" })).toHaveCount(0);
    });

    test("an open description covers no chip: every chip is still at its place on the screen's hit test", async ({ page }) => {
      const panel = await openPart2Panel(page);
      await panel.getByRole("button", { name: "App boundaries" }).first().click();
      const popover = page.getByRole("region", { name: "App boundaries" });
      const popoverBox = (await popover.boundingBox())!;
      for (const name of CHIPS) {
        const chips = panel.getByRole("button", { name });
        for (let i = 0; i < (await chips.count()); i++) {
          const box = (await chips.nth(i).boundingBox())!;
          const overlaps = box.x < popoverBox.x + popoverBox.width && box.x + box.width > popoverBox.x && box.y < popoverBox.y + popoverBox.height && box.y + box.height > popoverBox.y;
          expect(overlaps, `${name} #${i} is not under the open description`).toBe(false);
        }
      }
    });

    test("keeps every popover fully inside the viewport", async ({ page }) => {
      const panel = await openPart2Panel(page);
      for (const name of CHIPS) {
        const chips = panel.getByRole("button", { name });
        for (let i = 0; i < (await chips.count()); i++) {
          await chips.nth(i).click();
          const box = (await page.getByRole("region", { name }).boundingBox())!;
          expect(box.x, `${name} left`).toBeGreaterThanOrEqual(0);
          expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(viewport.width);
          expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(viewport.height);
          await page.keyboard.press("Escape");
        }
      }
    });
  });
}

test.describe("What changed in Part 2 fits its panel at 1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every popover stays inside the panel's width", async ({ page }) => {
    const panel = await openPart2Panel(page);
    const panelBox = (await panel.boundingBox())!;
    for (const name of CHIPS) {
      const chips = panel.getByRole("button", { name });
      for (let i = 0; i < (await chips.count()); i++) {
        await chips.nth(i).click();
        const box = (await page.getByRole("region", { name }).boundingBox())!;
        expect(box.x, `${name} left`).toBeGreaterThanOrEqual(panelBox.x);
        expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(panelBox.x + panelBox.width);
        await page.keyboard.press("Escape");
      }
    }
  });

  test("the side panel is kept to the diagram's height, and nothing in it is cut off", async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
    const architecture = page.locator("#architecture");
    await architecture.getByRole("group", { name: "Series part" }).getByRole("button", { name: "PART 2" }).click();
    const side = architecture.getByLabel("Details");
    await expect(side.getByText("What changed in Part 2")).toBeVisible();
    const canvas = (await architecture.locator(".bp-arch-explorer__canvas").boundingBox())!;
    const metrics = await side.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, height: el.getBoundingClientRect().height }));
    expect(metrics.height).toBeLessThanOrEqual(canvas.height + 1);
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
  });
;
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`A popover and the consent banner at ${viewport.width}px`, () => {
    test.use({ viewport, storageState: { cookies: [], origins: [] } });

    test("opens above the banner, never hidden behind it", async ({ page }) => {
      const panel = await openPart2Panel(page);
      const banner = page.getByRole("region", { name: "Analytics and cookies" });
      await expect(banner).toBeVisible();

      const chip = panel.getByRole("button", { name: "Secret containment" }).last();
      await chip.evaluate((el) => el.scrollIntoView({ block: "end" }));
      await chip.click();
      const popover = page.getByRole("region", { name: "Secret containment" });
      await expect(popover).toBeVisible();

      const box = (await popover.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      // Whatever is on top at the popover's centre is the popover, not the banner.
      const onTop = await popover.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      });
      expect(onTop).toBe(true);
    });
  });
}

for (const viewport of [
  { width: 1440, height: 1200 },
  { width: 390, height: 844 },
]) {
  test.describe(`Carried nodes at ${viewport.width}px`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await mockPriceRoute(page);
      await page.goto("/");
    });

    test("scrubbing Parts 1 to 6 keeps both analytics cards and their edges, labelled as built in Part 1 from Part 4 on", async ({ page }) => {
      const architecture = page.locator("#architecture");
      const scrubber = architecture.getByRole("group", { name: "Series part" });

      for (let part = 1; part <= 6; part++) {
        await scrubber.getByRole("button", { name: `PART ${part}` }).click();
        await expect(architecture.getByText(`Overview · Part ${part}`)).toBeVisible();

        for (const name of ANALYTICS_CARDS) {
          const card = architecture.getByRole("button", { name: new RegExp(`^${name}`) });
          await expect(card, `${name} in Part ${part}`).toHaveCount(1);
          // Parts 2 and 3 draw the cards themselves; Parts 4 to 6 carry them, first built in Part 1 (not Part 2, where they are copied from).
          await expect(card.getByText("Built in Part 1")).toHaveCount(part >= 4 ? 1 : 0);
          await expect(card.getByText("Built in Part 2")).toHaveCount(0);
          // Built, not predicted: never ghosted.
          await expect(card.getByText("PLANNED")).toHaveCount(0);
        }
        for (const edge of ANALYTICS_EDGES) {
          await expect(architecture.getByTestId(`rf__edge-${edge}`), `${edge} in Part ${part}`).toHaveCount(1);
        }
      }
    });

    test("Part 4's Google Analytics 4 card and panel note both read Built in Part 1", async ({ page }) => {
      const architecture = page.locator("#architecture");
      await architecture.getByRole("group", { name: "Series part" }).getByRole("button", { name: "PART 4" }).click();

      const card = architecture.getByRole("button", { name: /^Google Analytics 4, External/ });
      await expect(card.getByText("Built in Part 1")).toBeVisible();
      await expect(card).toHaveAccessibleName(/built in Part 1/i);

      await card.click();
      const panel = architecture.getByLabel("Details");
      await expect(panel.getByText("Built in Part 1; still running in this plan.")).toBeVisible();
    });

    test("what changed in Part 2 lists neither analytics node", async ({ page }) => {
      const architecture = page.locator("#architecture");
      const scrubber = architecture.getByRole("group", { name: "Series part" });
      await scrubber.getByRole("button", { name: "PART 2" }).click();

      const panel = architecture.getByLabel("Details");
      await expect(panel.getByText("What changed in Part 2")).toBeVisible();
      await expect(panel.getByText("Google Analytics 4")).toHaveCount(0);
      await expect(panel.getByText("Microsoft Clarity")).toHaveCount(0);
    });

    test("selecting a carried node shows its Part 1 text and ADR-0010", async ({ page }) => {
      const architecture = page.locator("#architecture");
      const scrubber = architecture.getByRole("group", { name: "Series part" });
      await scrubber.getByRole("button", { name: "PART 4" }).click();

      await architecture.getByRole("button", { name: /^Google Analytics 4, External/ }).click();
      const panel = architecture.getByLabel("Details");
      await expect(panel.getByText("Built in Part 1; still running in this plan.")).toBeVisible();
      await expect(panel.getByText(/Built in Part 2/)).toHaveCount(0);
      await expect(panel.getByText(/Page views and a short list of events/)).toBeVisible();
      await expect(panel.getByText("ADR-0010")).toBeVisible();
      await expect(panel.getByText("ADR pending: written before this part ships.")).toHaveCount(0);
    });
  });
}
