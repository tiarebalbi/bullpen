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

async function open(page: Page, part = 3): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto("/");
  await page.locator("#architecture").getByRole("group", { name: "Series part" }).getByRole("button", { name: `PART ${part}` }).click();
  await page.waitForTimeout(1200);
}
const pulses = (page: Page) => page.locator("#architecture [data-testid=edge-pulses]");
const pulsingEdges = async (page: Page): Promise<string[]> => (await pulses(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-edge")!))).sort();
async function shot(page: Page, name: string, width: number): Promise<void> {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  await page.locator("#architecture .react-flow").screenshot({ path: join(shotDir, `traffic-${name}-${width}.png`) });
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
        const group = page.locator(`#architecture [data-testid=edge-pulses][data-edge="${edge.id}"]`);
        await expect(group).toHaveAttribute("data-source", edge.rate.source);
        expect(Number(await group.getAttribute("data-pulses"))).toBeGreaterThanOrEqual(1);
        expect(await group.locator("circle").count()).toBe(Number(await group.getAttribute("data-pulses")));
      }
      await shot(page, "moving", viewport.width);
    });

    moving("a busier line carries more pulses than a quiet one, and the daily cron's carries one", async ({ page }) => {
      await open(page);
      const count = async (id: string) => Number(await page.locator(`#architecture [data-testid=edge-pulses][data-edge="${id}"]`).getAttribute("data-pulses"));
      expect(await count("trading-app-to-trading-schema")).toBeGreaterThan(await count("reader-to-landing"));
      expect(await count("reader-to-landing")).toBeGreaterThan(await count("market-data-to-crypto-provider"));
      expect(await count("market-data-to-crypto-provider")).toBeGreaterThan(await count("daily-cron-to-market-data"));
      expect(await count("daily-cron-to-market-data")).toBe(1);
    });

    moving("pulses move in the direction of the request: along each line from its source to its target", async ({ page }) => {
      await open(page);
      for (const id of ["reader-to-landing", "trading-app-to-trading-schema", "market-data-to-stock-provider"]) {
        const [pathD, ends] = await page.evaluate((edgeId) => {
          const group = document.querySelector(`#architecture [data-testid=edge-pulses][data-edge="${edgeId}"]`)!;
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
      const fill = (id: string) => page.locator(`#architecture [data-testid=edge-pulses][data-edge="${id}"] circle`).first().evaluate((c) => (c as SVGElement).style.fill);
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

    test("in a planned part, only the lines carried forward from Part 3 pulse: a planned line carries none", async ({ page }) => {
      await open(page, 4);
      const moving = await pulsingEdges(page);
      for (const id of moving) expect(EDGES, `${id} is a Part 3 line`).toContain(id);
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

    moving("the panel lists every connection with its rate and source, and marks the illustrative ones", async ({ page }) => {
      await open(page);
      const items = page.locator("#architecture section[aria-label=Traffic] li");
      await expect(items).toHaveCount(EDGES.length);
      for (const edge of content.edges) {
        const item = page.locator(`#architecture section[aria-label=Traffic] li[data-edge="${edge.id}"]`);
        await expect(item).toHaveAttribute("data-source", edge.rate.source);
        if (edge.rate.source === "illustrative") await expect(item).toContainText("Illustrative");
        else await expect(item).toContainText(edge.rate.source);
      }
    });
  });
}
