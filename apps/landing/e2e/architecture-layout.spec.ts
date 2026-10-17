import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Part 3 reads left to right: actors, then the apps (the Vercel project box), then the database box, with the outside services on the
// right edge. These tests hold the picture to that, and to the rule that a line never runs through a box it is not joined to. Set
// SCREENSHOT_DIR to keep a picture with each toggle on.
const shotDir = process.env.SCREENSHOT_DIR;
const content = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "content", "architecture", "part-03.json"), "utf8")) as {
  nodes: Array<{ id: string; label: string; purpose: string }>;
  edges: Array<{ id: string; a: string; b: string; caption?: string }>;
  groups: Array<{ id: string; label: string; nodeIds: string[]; nodeId?: string }>;
};

async function openPart3(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto("/");
  const architecture = page.locator("#architecture");
  await architecture.getByRole("group", { name: "Series part" }).getByRole("button", { name: "PART 3" }).click();
  await page.waitForTimeout(1500);
}

interface Rect { left: number; top: number; right: number; bottom: number }
interface Geometry {
  nodes: Record<string, Rect>;
  groups: Record<string, Rect>;
  edges: Record<string, Array<{ x: number; y: number }>>;
}

/** Where every card, box and line is on screen: lines as points sampled every 6 px along their path. */
async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const rect = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const nodes: Record<string, Rect> = {};
    const groups: Record<string, Rect> = {};
    for (const el of document.querySelectorAll("#architecture .react-flow__node-archNode")) nodes[el.getAttribute("data-id")!] = rect(el);
    for (const el of document.querySelectorAll("#architecture .react-flow__node-archGroup")) groups[el.getAttribute("data-id")!] = rect(el);
    const edges: Record<string, Array<{ x: number; y: number }>> = {};
    for (const el of document.querySelectorAll("#architecture .react-flow__edge")) {
      const path = el.querySelector<SVGPathElement>("path.react-flow__edge-path");
      if (!path) continue;
      const m = path.getScreenCTM()!;
      const points: Array<{ x: number; y: number }> = [];
      const length = path.getTotalLength();
      for (let at = 0; at <= length; at += 6) {
        const p = path.getPointAtLength(at);
        points.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
      }
      edges[el.getAttribute("data-id")!.replace(/^xy-edge__/, "")] = points;
    }
    return { nodes, groups, edges };
  });
}

const inside = (p: { x: number; y: number }, r: Rect, pad = 0): boolean => p.x > r.left - pad && p.x < r.right + pad && p.y > r.top - pad && p.y < r.bottom + pad;
const cx = (r: Rect): number => (r.left + r.right) / 2;
const cy = (r: Rect): number => (r.top + r.bottom) / 2;

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`Part 3 layout at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("reads left to right: actors, then the apps, then the database box, with the outside services on the right edge", async ({ page }) => {
      await openPart3(page);
      const g = await geometry(page);
      const left = (id: string): number => g.nodes[id]!.left;
      for (const actor of ["reader", "player", "daily-ingest-cron"]) for (const app of ["landing-app", "trading-app", "market-data-service"]) expect(left(actor), `${actor} before ${app}`).toBeLessThan(left(app));
      for (const app of ["trading-app", "market-data-service"]) for (const schema of ["schema-trading", "schema-market-data", "prices-v1"]) expect(left(app), `${app} before ${schema}`).toBeLessThan(left(schema));
      for (const schema of ["schema-trading", "schema-market-data", "prices-v1"]) for (const outside of ["market-data-provider", "stock-data-provider", "google-analytics", "microsoft-clarity"]) expect(left(schema), `${schema} before ${outside}`).toBeLessThan(left(outside));
      const rightEdge = Math.max(...Object.values(g.nodes).map((r) => r.right));
      for (const outside of ["market-data-provider", "stock-data-provider", "google-analytics", "microsoft-clarity"]) expect(g.nodes[outside]!.right, `${outside} on the right edge`).toBeGreaterThan(rightEdge - 8);
      if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        await page.locator("#architecture").locator(".react-flow").screenshot({ path: join(shotDir, `part3-default-${viewport.width}.png`) });
      }
    });

    test("draws the database as its box, not as a card of its own", async ({ page }) => {
      await openPart3(page);
      const g = await geometry(page);
      expect(g.nodes["bullpen-database"]).toBeUndefined();
      const box = g.groups["neon-database"]!;
      for (const schema of ["schema-trading", "schema-market-data", "prices-v1"]) {
        const r = g.nodes[schema]!;
        expect(r.left).toBeGreaterThanOrEqual(box.left - 1);
        expect(r.right).toBeLessThanOrEqual(box.right + 1);
        expect(r.top).toBeGreaterThanOrEqual(box.top - 1);
        expect(r.bottom).toBeLessThanOrEqual(box.bottom + 1);
      }
      await expect(page.locator("#architecture").getByRole("button", { name: "One Neon database, Data" })).toBeVisible();
    });

    test("no line passes through a card it is not joined to, nor through a box it has no end in", async ({ page }) => {
      await openPart3(page);
      const g = await geometry(page);
      expect(Object.keys(g.edges).sort()).toEqual(content.edges.map((e) => e.id).sort());
      const members = new Map(content.groups.map((grp) => [grp.id, new Set(grp.nodeIds)]));
      const problems: string[] = [];
      for (const edge of content.edges) {
        const points = g.edges[edge.id]!;
        for (const [id, r] of Object.entries(g.nodes)) {
          if (id === edge.a || id === edge.b) continue;
          if (points.some((p) => inside(p, r))) problems.push(`${edge.id} runs through ${id}`);
        }
        for (const [id, r] of Object.entries(g.groups)) {
          const joined = members.get(id)!;
          if (joined.has(edge.a) || joined.has(edge.b)) continue;
          if (points.some((p) => inside(p, r))) problems.push(`${edge.id} runs through the box ${id}`);
        }
      }
      expect(problems).toEqual([]);
    });

    test("the analytics lines stay on their own side: none crosses the picture from one app to the other's side", async ({ page }) => {
      await openPart3(page);
      const g = await geometry(page);
      for (const id of ["landing-to-google-analytics", "landing-to-microsoft-clarity", "trading-app-to-google-analytics", "trading-app-to-microsoft-clarity"]) {
        const points = g.edges[id]!;
        const span = Math.abs(points.at(-1)!.y - points[0]!.y);
        expect(span, `${id} rises or falls at most a short way`).toBeLessThan(cy(g.nodes["trading-app"]!) - cy(g.nodes["market-data-service"]!));
      }
    });

    test("selecting the database box's title selects the database node, and the box stays when the grouping is switched off", async ({ page }) => {
      await openPart3(page);
      const architecture = page.locator("#architecture");
      const title = architecture.getByRole("button", { name: "One Neon database, Data" });
      await title.click();
      await expect(title).toHaveAttribute("aria-pressed", "true");
      const purpose = content.nodes.find((n) => n.id === "bullpen-database")!.purpose;
      await expect(architecture.getByLabel("Details").getByText(purpose, { exact: true }).first()).toBeVisible();

      await architecture.getByRole("switch", { name: "Group by quanta" }).click();
      await expect(architecture.getByText("One Vercel project, shared release")).toHaveCount(0);
      await expect(architecture.getByRole("button", { name: "One Neon database, Data" })).toBeVisible();
    });

    test("joins each line at the sides that face each other: side to side across the columns, top to bottom within one", async ({ page }) => {
      await openPart3(page);
      const g = await geometry(page);
      const start = (id: string) => g.edges[id]![0]!;
      const end = (id: string) => g.edges[id]!.at(-1)!;
      // across the columns the line leaves the right side of the card and arrives at the left side of the next
      expect(Math.abs(start("player-to-trading-app").x - g.nodes["player"]!.right)).toBeLessThan(6);
      expect(Math.abs(end("player-to-trading-app").x - g.nodes["trading-app"]!.left)).toBeLessThan(12);
      // the trading app and Market Data share a column, so that line runs from the top of one to the bottom of the other
      expect(Math.abs(start("trading-app-to-market-data").y - g.nodes["trading-app"]!.top)).toBeLessThan(6);
      expect(Math.abs(end("trading-app-to-market-data").y - g.nodes["market-data-service"]!.bottom)).toBeLessThan(12);
      expect(cx(g.nodes["trading-app"]!)).toBeCloseTo(cx(g.nodes["market-data-service"]!), 0);
    });

    test("labels the landing's line to Market Data /api/price (rewrite), always", async ({ page }) => {
      await openPart3(page);
      await expect(page.locator("#architecture").getByText("/api/price (rewrite)")).toBeVisible();
    });

    for (const toggle of ["Data ownership", "Group by quanta", "Sync vs async"]) {
      test(`with ${toggle} on: the picture still has no line through a card, and a picture is kept`, async ({ page }) => {
        await openPart3(page);
        const architecture = page.locator("#architecture");
        const sw = architecture.getByRole("switch", { name: toggle });
        if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
        await page.waitForTimeout(900);
        const g = await geometry(page);
        for (const edge of content.edges) {
          for (const [id, r] of Object.entries(g.nodes)) {
            if (id === edge.a || id === edge.b) continue;
            expect(g.edges[edge.id]!.some((p) => inside(p, r)), `${edge.id} through ${id} with ${toggle} on`).toBe(false);
          }
        }
        if (shotDir) {
          mkdirSync(shotDir, { recursive: true });
          await architecture.locator(".react-flow").screenshot({ path: join(shotDir, `part3-${toggle.toLowerCase().replace(/[^a-z]+/g, "-")}-${viewport.width}.png`) });
        }
      });
    }
  });
}

// The parts after Part 3 carry its nodes and keep its grid, so a line in them runs through no card it is not joined to either.
for (const part of [4, 5, 6]) {
  test(`Part ${part} keeps Part 3's grid: no line passes through a card it is not joined to`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
    await page.goto("/");
    await page.locator("#architecture").getByRole("group", { name: "Series part" }).getByRole("button", { name: `PART ${part}` }).click();
    await page.waitForTimeout(1500);
    const own = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "content", "architecture", `part-0${part}.json`), "utf8")) as { edges: Array<{ id: string; a: string; b: string }> };
    const ends = new Map([...content.edges, ...own.edges].map((e) => [e.id, e]));
    const g = await geometry(page);
    const problems: string[] = [];
    for (const [id, points] of Object.entries(g.edges)) {
      const edge = ends.get(id)!;
      for (const [nodeId, r] of Object.entries(g.nodes)) {
        if (nodeId !== edge.a && nodeId !== edge.b && points.some((p) => inside(p, r))) problems.push(`${id} runs through ${nodeId}`);
      }
    }
    expect(problems).toEqual([]);
  });
}
