import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Traffic on Part 3's connections: pulses moving along each line in the direction of the request, as many as its rate says, with the rate's
// source shown. Set SCREENSHOT_DIR to keep a picture of each state.
const shotDir = process.env.SCREENSHOT_DIR;
const content = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "content", "architecture", "part-03.json"), "utf8")) as {
  status: "built" | "planned";
  edges: Array<{ id: string; a: string; b: string; rate: { count: number; per: string; source: string; basis: string } }>;
};
const EDGES = content.edges.map((e) => e.id);
const part2 = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "content", "architecture", "part-02.json"), "utf8")) as { edges: Array<{ id: string }> };
// The lines Part 2 already had are running whatever Part 3's status is; the lines Part 3 adds are planned until it is published.
const BUILT_BEFORE = EDGES.filter((id) => part2.edges.some((e) => e.id === id));
// Until the publish commit flips Part 3 to built, its lines are planned, and a planned line carries no pulses: the tests of what moves run
// from that commit on, and the one test of what does not move runs until it.
const BUILT = content.status === "built";
const moving = BUILT ? test : test.skip;

async function open(page: Page, part = 3, url = "/"): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto(url);
  // On the landing the explorer sits in #architecture with its own scrubber; on /architecture the one scrubber is the page's.
  const scrubberScope = url === "/" ? page.locator("#architecture") : page;
  await scrubberScope.getByRole("group", { name: "Series part" }).getByRole("button", { name: `PART ${part}` }).click();
  await page.waitForTimeout(1200);
}
const pulses = (page: Page) => page.locator("[data-testid=edge-pulses]");
const scopeOf = (page: Page, url: string) => (url === "/" ? page.locator("#architecture") : page.getByRole("tabpanel"));
const pulsingEdges = async (page: Page): Promise<string[]> => (await pulses(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-edge")!))).sort();
async function shot(page: Page, name: string, width: number, whole = false): Promise<void> {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  const target = whole ? page : page.locator("#architecture .react-flow");
  await target.screenshot({ path: join(shotDir, `traffic-${name}-${width}.png`) });
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`traffic at ${viewport.width}px`, () => {
    test.use({ viewport });

    moving("every connection of Part 3 carries pulses, each with a rate and a source", async ({ page }) => {
      await open(page);
      expect(await pulsingEdges(page)).toEqual([...EDGES].sort());
      for (const edge of content.edges) {
        const group = page.locator(`[data-testid=edge-pulses][data-edge="${edge.id}"]`);
        await expect(group).toHaveAttribute("data-source", edge.rate.source);
        expect(Number(await group.getAttribute("data-pulses"))).toBeGreaterThanOrEqual(1);
        expect(await group.locator("circle").count()).toBe(Number(await group.getAttribute("data-pulses")));
      }
      await shot(page, "moving", viewport.width);
    });

    moving("a busier line carries more pulses than a quiet one, and the daily cron's carries one", async ({ page }) => {
      await open(page);
      const count = async (id: string) => Number(await page.locator(`[data-testid=edge-pulses][data-edge="${id}"]`).getAttribute("data-pulses"));
      expect(await count("trading-app-to-trading-schema")).toBeGreaterThan(await count("reader-to-landing"));
      expect(await count("reader-to-landing")).toBeGreaterThan(await count("market-data-to-crypto-provider"));
      expect(await count("market-data-to-crypto-provider")).toBeGreaterThan(await count("daily-cron-to-market-data"));
      expect(await count("daily-cron-to-market-data")).toBe(1);
    });

    moving("pulses move in the direction of the request: along each line from its source to its target", async ({ page }) => {
      await open(page);
      for (const id of ["reader-to-landing", "trading-app-to-trading-schema", "market-data-to-stock-provider"]) {
        const [pathD, ends] = await page.evaluate((edgeId) => {
          const group = document.querySelector(`[data-testid=edge-pulses][data-edge="${edgeId}"]`)!;
          const motion = group.querySelector("animateMotion")!.getAttribute("path")!;
          return [motion, motion.match(/-?[\d.]+/g)!.map(Number)] as const;
        }, id);
        expect(pathD.startsWith("M")).toBe(true);
        // the path's first point is at the source card and its last at the target card
        const edge = content.edges.find((e) => e.id === id)!;
        const [sx, sy, tx, ty] = [ends[0]!, ends[1]!, ends[ends.length - 2]!, ends[ends.length - 1]!];
        const nodes = await page.evaluate(([a, b]) => {
          const pos = (nid: string) => {
            const t = (document.querySelector(`#architecture .react-flow__node[data-id="${nid}"]`) as HTMLElement).style.transform.match(/-?[\d.]+/g)!.map(Number);
            return { x: t[0]!, y: t[1]! };
          };
          return { a: pos(a!), b: pos(b!) };
        }, [edge.a, edge.b]);
        // the source end is nearer the source card than the target card is, and the target end is nearer the target
        const d = (px: number, py: number, n: { x: number; y: number }) => Math.hypot(px - (n.x + 88), py - (n.y + 30));
        expect(d(sx, sy, nodes.a)).toBeLessThan(d(sx, sy, nodes.b));
        expect(d(tx, ty, nodes.b)).toBeLessThan(d(tx, ty, nodes.a));
      }
    });

    moving("pause stops the pulses and writes each line's rate on it; play starts them again", async ({ page }) => {
      await open(page);
      await page.getByRole("button", { name: /Pause traffic/ }).click();
      await expect.poll(() => pulsingEdges(page)).toEqual([]);
      await expect(page.locator("#architecture").getByText("14/s").first()).toBeVisible();
      await expect(page.locator("#architecture").getByText(/1\/day/).first()).toBeVisible();
      await shot(page, "paused", viewport.width);
      await page.getByRole("button", { name: /Play traffic/ }).click();
      await expect.poll(() => pulsingEdges(page)).toEqual([...EDGES].sort());
    });

    moving("with Data ownership on, each owner's pulses take its colour, and no line leaves a schema or the view", async ({ page }) => {
      await open(page);
      await page.locator("#architecture").getByRole("switch", { name: "Data ownership" }).click();
      await page.waitForTimeout(500);
      const fill = (id: string) => page.locator(`[data-testid=edge-pulses][data-edge="${id}"] circle`).first().evaluate((c) => (c as SVGElement).style.fill);
      const trading = await fill("trading-app-to-prices-v1");
      expect(trading).toMatch(/oklch/);
      expect(await fill("trading-app-to-trading-schema")).toBe(trading);
      const marketData = await fill("market-data-to-market-data-schema");
      expect(marketData).toMatch(/oklch/);
      expect(marketData).not.toBe(trading);
      expect(await fill("market-data-to-stock-provider")).toBe(marketData);
      expect(await fill("reader-to-landing")).toMatch(/ember/); // a line from a node nobody owns keeps the ember
      // trading's pulses end at the view and the trading schema: no connection leaves a schema or the view
      const dataNodes = ["schema-trading", "schema-market-data", "prices-v1"];
      expect(content.edges.filter((e) => dataNodes.includes(e.a))).toEqual([]);
      await shot(page, "data-ownership", viewport.width);
    });

    moving("following a request lights only the step's line, and every other line is still and dim", async ({ page }) => {
      await open(page);
      await page.locator("#architecture").getByRole("button", { name: /Follow a price request/ }).click();
      await expect.poll(async () => (await pulsingEdges(page)).length).toBe(1);
      expect(EDGES).toContain((await pulsingEdges(page))[0]);
      await shot(page, "follow-price-request", viewport.width);
    });

    moving("following a buy lights one line at a time as well", async ({ page }) => {
      await open(page);
      await page.locator("#architecture").getByRole("radio", { name: "a buy" }).check({ force: true });
      await page.locator("#architecture").getByRole("button", { name: /Follow a buy/ }).click();
      await expect.poll(async () => (await pulsingEdges(page)).length).toBe(1);
      await shot(page, "follow-buy", viewport.width);
    });

    moving("reduced motion: no pulse moves, each line has static arrows and its rate written on it, and the control says why", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page);
      expect(await pulsingEdges(page)).toEqual([]);
      await expect(page.locator("#architecture circle.bp-arch-pulse")).toHaveCount(0);
      await expect(page.locator("#architecture animateMotion")).toHaveCount(0);
      expect(await page.locator("#architecture .react-flow__edge textPath").count()).toBeGreaterThanOrEqual(EDGES.length * 3);
      await expect(page.locator("#architecture").getByText("14/s").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Traffic is off: reduced motion" })).toBeDisabled();
      await shot(page, "reduced-motion", viewport.width);
    });

    test("in a planned part, only the lines carried forward from Parts 3 and 4 pulse: a planned line carries none", async ({ page }) => {
      await open(page, 5);
      const moving = await pulsingEdges(page);
      for (const id of moving) expect([...EDGES, "sweeper-to-trading-app"], `${id} is a built line`).toContain(id);
      expect(moving).not.toContain("trading-app-to-saga");
      expect(moving).not.toContain("trading-app-to-queue");
    });

    test("while Part 3 is planned, only the lines Part 2 already had carry pulses; the lines it adds carry none, and the control and the panel are still there", async ({ page }) => {
      test.skip(BUILT, "Part 3 is built: see the tests above");
      await open(page);
      expect(BUILT_BEFORE.length).toBeGreaterThan(0);
      expect(await pulsingEdges(page)).toEqual([...BUILT_BEFORE].sort());
      await expect(page.locator("#architecture").getByRole("button", { name: /Pause traffic/ })).toBeVisible();
      await expect(page.locator("#architecture section[aria-label=Traffic] li")).toHaveCount(EDGES.length);
    });

    for (const where of [{ name: "the landing", url: "/" }, { name: "the architecture page", url: "/architecture" }]) {
      test(`${where.name}: the side panel has one Traffic details button, and no longer lists the traffic`, async ({ page }) => {
        await open(page, 3, where.url);
        const panel = scopeOf(page, where.url).getByLabel("Details");
        await expect(panel.getByRole("button", { name: "Traffic details" })).toHaveCount(1);
        await expect(panel.locator("section[aria-label=Traffic]")).toHaveCount(0);
        await expect(page.locator("dialog.bp-traffic-sheet")).not.toBeVisible();
      });

      test(`${where.name}: the button opens the sheet: a title, the three labels explained, the groups in order, and every animated edge`, async ({ page }) => {
        await open(page, 3, where.url);
        await page.getByRole("button", { name: "Traffic details" }).click();
        const sheet = page.getByRole("dialog", { name: /in detail/ });
        await expect(sheet).toBeVisible();
        for (const word of ["Measured", "Configured", "Illustrative"]) await expect(sheet.locator(".bp-traffic-sheet__intro")).toContainText(word);
        const groups = await sheet.locator("section[data-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-group")));
        expect(groups).toEqual(["measured", "configured", "illustrative"]);
        for (const edge of content.edges) {
          const row = sheet.locator(`li[data-edge="${edge.id}"]`);
          await expect(row).toHaveCount(1);
          await expect(row).toHaveAttribute("data-source", edge.rate.source);
          await expect(row).toContainText("→");
          // each row sits in the group of its own label
          expect(await row.evaluate((el) => el.closest("section")!.getAttribute("data-group"))).toBe(edge.rate.source);
        }
        // every line that carries pulses is in the sheet
        if (BUILT) expect(await pulsingEdges(page)).toEqual([...EDGES].sort());
        await shot(page, "sheet-open", viewport.width, true);
      });

      test(`${where.name}: the sheet closes on the close button, on Escape and on a click on the overlay, and focus goes back to the button`, async ({ page }) => {
        await open(page, 3, where.url);
        const button = page.getByRole("button", { name: "Traffic details" });
        const sheet = page.getByRole("dialog", { name: /in detail/ });
        for (const how of ["button", "escape", "overlay"]) {
          await button.click();
          await expect(sheet).toBeVisible();
          await expect(sheet.getByRole("button", { name: "Close the sheet" })).toBeFocused(); // focus moves into the sheet
          if (how === "button") await sheet.getByRole("button", { name: "Close the sheet" }).click();
          if (how === "escape") await page.keyboard.press("Escape");
          if (how === "overlay") await page.mouse.click(viewport.width / 2, 20); // the dimmed page above the sheet
          await expect(sheet).not.toBeVisible();
          await expect(button, `after closing with the ${how}`).toBeFocused();
        }
      });

      test(`${where.name}: the page behind does not scroll while the sheet is open`, async ({ page }) => {
        await open(page, 3, where.url);
        await page.getByRole("button", { name: "Traffic details" }).click();
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
        await page.getByRole("dialog", { name: /in detail/ }).getByRole("button", { name: "Close the sheet" }).click();
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
      });
    }

    test("the side panel is kept to the diagram's height, with a summary and the two buttons that open the rest", async ({ page }) => {
      await open(page);
      const canvas = (await page.locator("#architecture .bp-arch-explorer__canvas").boundingBox())!;
      const panel = page.locator("#architecture").getByLabel("Details");
      const box = (await panel.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(canvas.height + 1);
      await expect(panel.getByRole("list", { name: "Part 3 at a glance" })).toContainText("added");
      await expect(panel.getByRole("list", { name: "Part 3 at a glance" })).toContainText("lines with a rate");
      await expect(panel.getByRole("button", { name: "What changed" })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Traffic details" })).toBeVisible();
      // the long lists are not in the panel: they are in the sheet
      await expect(panel.locator("li[data-edge]")).not.toBeVisible();
      await shot(page, "side-panel", viewport.width);
    });

    test("What changed opens the sheet on the changes: the nodes, the controls, the decisions and what week one predicted; the sections switch", async ({ page }) => {
      await open(page);
      await page.getByRole("button", { name: "What changed" }).click();
      const sheet = page.getByRole("dialog", { name: /in detail/ });
      await expect(sheet.getByRole("button", { name: "What changed", pressed: true })).toBeVisible();
      // organized in groups under headings, in this order
      const headings = await sheet.locator("h4").allInnerTexts();
      expect(headings.map((h) => h.toLowerCase())).toEqual(["services, data and connections", "new nodes and the rules on them", "decisions"]);
      await expect(sheet.getByText("Market Data Service").first()).toBeVisible();
      await expect(sheet.getByText("ADR-0013", { exact: false }).first()).toBeVisible();
      await expect(sheet.getByText("Predicted in week one, not built")).toBeVisible();
      await sheet.getByRole("button", { name: "Traffic", pressed: false }).click();
      await expect(sheet.locator("section[data-group=measured]")).toBeVisible();
      await sheet.getByRole("button", { name: "What changed", pressed: false }).click();
      await expect(sheet.getByText("Predicted in week one, not built")).toBeVisible();
      await shot(page, "sheet-changes", viewport.width, true);
    });

    test("on a touch screen a tap on a row shows the whole basis, and the next tap hides it again", async ({ browser }) => {
      test.skip(viewport.width > 500, "the touch test is for the phone width");
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await open(page);
      await page.getByRole("button", { name: "Traffic details" }).tap();
      const sheet = page.getByRole("dialog", { name: /in detail/ });
      const row = sheet.locator('li[data-edge="trading-app-to-trading-schema"]'); // the longest basis
      const basis = row.locator(".bp-traffic-sheet__basis");
      const cut = () => basis.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      expect(await cut()).toBe(true); // cut at two lines on a phone
      await row.locator("button").tap();
      await expect(row.locator("button")).toHaveAttribute("aria-expanded", "true");
      expect(await cut()).toBe(false); // the whole text
      await shot(page, "sheet-row-expanded", viewport.width, true);
      await row.locator("button").tap();
      await expect(row.locator("button")).toHaveAttribute("aria-expanded", "false");
      expect(await cut()).toBe(true);
      await context.close();
    });

    test("the sheet is at most 70% of the viewport high, pinned to the bottom, and its content scrolls inside it", async ({ page }) => {
      await open(page);
      await page.getByRole("button", { name: "Traffic details" }).click();
      const sheet = page.getByRole("dialog", { name: /in detail/ });
      const box = (await sheet.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(viewport.height * 0.7 + 1);
      await page.waitForTimeout(500); // the slide has finished
      const settled = (await sheet.boundingBox())!;
      expect(Math.abs(settled.y + settled.height - viewport.height)).toBeLessThan(2);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
      expect(await sheet.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    });

    test("the sheet slides up, and under reduced motion it appears in place with no animation", async ({ page }) => {
      await open(page);
      await page.getByRole("button", { name: "Traffic details" }).click();
      expect(await page.getByRole("dialog", { name: /in detail/ }).evaluate((el) => getComputedStyle(el).animationName)).toBe("bp-sheet-up");

      const reduced = await page.context().newPage();
      await reduced.emulateMedia({ reducedMotion: "reduce" });
      await open(reduced);
      await reduced.getByRole("button", { name: "Traffic details" }).click();
      expect(await reduced.getByRole("dialog", { name: /in detail/ }).evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    });

    test("clicking a line opens its own panel with its rate and where the rate comes from, and a node click still wins", async ({ page }) => {
      await open(page);
      const edge = content.edges.find((e) => e.id === "trading-app-to-trading-schema")!;
      await page.locator(`#architecture .react-flow__edge[data-id="${edge.id}"] path.react-flow__edge-interaction`).dispatchEvent("click");
      const panel = page.locator("#architecture").getByLabel("Details");
      await expect(panel.getByRole("heading", { name: "Bullpen Trading App → trading schema" })).toBeVisible();
      await expect(panel.locator(".bp-edge-panel__rate")).toHaveAttribute("data-source", "measured");
      await expect(panel.locator(".bp-edge-panel__rate")).toContainText("14 a second, measured");
      await shot(page, "line-panel", viewport.width);
      await panel.getByRole("button", { name: "Close details" }).click();
      await expect(panel.getByRole("button", { name: "Traffic details" })).toBeVisible();
    });
  });
}
