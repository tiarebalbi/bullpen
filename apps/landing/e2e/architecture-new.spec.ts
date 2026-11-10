import { expect, test, type Locator, type Page } from "@playwright/test";

// What a moment adds is drawn in the accent (ADR-0027's bonus, and every part): the nodes and lines the part before it does not have, the set "What changed"
// counts as added. These run in a real browser, where the diagram is laid out; the choice of nodes is also tested against the real content in lib/architecture.test.ts.

const price = JSON.stringify({ symbol: "BTC-USD", price: 65432.1, changePercent: 2.34, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() });
const mock = (page: Page) => page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: price }));
const scrubber = (page: Page) => page.getByRole("group", { name: "Series part" });
const newNodes = (page: Page) => page.locator('#architecture [role="button"][data-new="true"], main [role="button"][data-new="true"]');
const names = async (loc: Locator) => (await loc.evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").replace(", new in this part", "")))).sort();

async function selectBonus(page: Page): Promise<void> {
  await scrubber(page).getByRole("button", { name: /BONUS/ }).click();
  await expect(page.getByText("What changed in the bonus")).toBeVisible();
}

for (const where of [
  { label: "the architecture page", url: "/architecture#overview" },
  { label: "the home page", url: "/" },
]) {
  test.describe(`New in this part, on ${where.label}`, () => {
    test.use({ viewport: { width: 1440, height: 1300 } });
    test.beforeEach(async ({ page }) => {
      await mock(page);
      await page.goto(where.url);
      await page.waitForLoadState("networkidle");
    });

    test("the bonus marks the gateway, the handles schema and its published view, and their three lines, and nothing carried over", async ({ page }) => {
      await selectBonus(page);
      expect(await names(newNodes(page))).toEqual(["Vercel AI Gateway, External", "handles schema, Data", "handles.approved_v1, Data"].sort());
      const lines = page.locator('path[data-new="true"]');
      await expect(lines).toHaveCount(3);
      await expect(lines.first()).toHaveCSS("stroke-width", "2px");
      await expect(page.getByTestId("legend-new")).toContainText("New in this part");
    });

    test("Part 4 marks Neon Auth, and not what earlier parts built", async ({ page }) => {
      await scrubber(page).getByRole("button", { name: "PART 4" }).click();
      const marked = await names(newNodes(page));
      expect(marked.some((n) => n.startsWith("Neon Auth"))).toBe(true);
      for (const carried of ["Bullpen Landing", "Bullpen Trading App", "Market Data service", "trading schema", "market_data schema"]) expect(marked.some((n) => n.toLowerCase().startsWith(carried.toLowerCase())), carried).toBe(false);
    });

    test("Part 1 marks nothing and has no legend entry for it", async ({ page }) => {
      await scrubber(page).getByRole("button", { name: "PART 1" }).click();
      await expect(newNodes(page)).toHaveCount(0);
      await expect(page.getByTestId("legend-new")).toHaveCount(0);
    });

    test("a planned part's new nodes keep a dashed outline in the accent at full strength, and its carried nodes are ghosted", async ({ page }) => {
      await scrubber(page).getByRole("button", { name: "PART 5" }).click();
      const planned = newNodes(page).first();
      await expect(planned).toBeVisible();
      const box = planned.locator("> div:not([class*='react-flow__handle'])");
      await expect(box).toHaveCSS("border-top-style", "dashed");
      await expect(box).toHaveCSS("opacity", "1");
      await expect(planned.getByText("PLANNED")).toBeVisible();
      const ghostedCarried = page.locator('[role="button"]:not([data-new])').filter({ has: page.getByText("PLANNED") });
      for (const el of await ghostedCarried.all()) await expect(el.locator("> div:not([class*='react-flow__handle'])")).toHaveCSS("opacity", "0.55");
    });
  });
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`New in this part, ${theme} theme`, () => {
    test.use({ viewport: { width: 1440, height: 1300 } });

    test("the accent stroke is at least 3:1 against what it sits on, and the NEW label 4.5:1, and the glow is still when motion is reduced", async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem("bp-theme", t), theme);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await mock(page);
      await page.goto("/architecture#overview");
      await selectBonus(page);
      const gateway = page.getByRole("button", { name: /^Vercel AI Gateway, External/ });
      await expect(gateway).toBeVisible();
      const ratios = await page.evaluate(() => {
        // Every colour goes through a canvas, which gives sRGB whatever the CSS space was (the tokens are oklch).
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        const rgb = (css: string): [number, number, number] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!];
        };
        const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const ratio = (a: string, b: string) => {
          const [x, y] = [lum(rgb(a)), lum(rgb(b))];
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const node = document.querySelector<HTMLElement>('[data-new="true"][role="button"]')!;
        const box = node.querySelector<HTMLElement>(":scope > div:not([class*='react-flow__handle'])")!;
        const border = getComputedStyle(box).borderTopColor;
        const inside = getComputedStyle(box).backgroundColor;
        const canvasBg = getComputedStyle(document.querySelector(".react-flow")!).backgroundColor;
        const label = [...node.querySelectorAll("span")].find((s) => s.textContent === "NEW")!;
        const labelStyle = getComputedStyle(label);
        return {
          strokeInside: ratio(border, inside),
          strokeOutside: ratio(border, canvasBg === "rgba(0, 0, 0, 0)" ? getComputedStyle(document.body).backgroundColor : canvasBg),
          label: ratio(labelStyle.color, labelStyle.backgroundColor),
          animation: getComputedStyle(box).animationName,
        };
      });
      expect(ratios.strokeInside, `stroke on the node (${theme})`).toBeGreaterThanOrEqual(3);
      expect(ratios.strokeOutside, `stroke on the canvas (${theme})`).toBeGreaterThanOrEqual(3);
      expect(ratios.label, `NEW label (${theme})`).toBeGreaterThanOrEqual(4.5);
      expect(ratios.animation).toBe("none");
    });
  });
}

test.describe("New in this part: motion", () => {
  test.use({ viewport: { width: 1440, height: 1300 } });

  test("breathes slowly, every 2 to 3 seconds, when motion is allowed", async ({ page }) => {
    await mock(page);
    await page.goto("/architecture#overview");
    await selectBonus(page);
    const box = page.getByRole("button", { name: /^Vercel AI Gateway, External/ }).locator("> div:not([class*='react-flow__handle'])");
    const style = await box.evaluate((el) => ({ name: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration, iteration: getComputedStyle(el).animationIterationCount }));
    expect(style.name).toBe("bp-arch-new-glow");
    const seconds = Number.parseFloat(style.duration);
    expect(seconds).toBeGreaterThanOrEqual(2);
    expect(seconds).toBeLessThanOrEqual(3);
    expect(style.iteration).toBe("infinite");
  });
});
