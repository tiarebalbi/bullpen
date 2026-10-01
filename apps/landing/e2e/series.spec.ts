import { expect, test, type Page } from "@playwright/test";

// The series section as it stands once Part 1 is out: Part 1 published, with its date and a link that
// opens the post; Part 2 next; the rest planned. The facts are the ones in content/series.json.

const POST_1 = "https://tiarebalbi.com/en/blog/when-to-use-microservices-2026";

async function mockPrice(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ symbol: "BTC-USD", price: 65432.1, changePercent: 2.34, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }),
    }),
  );
}

for (const viewport of [
  { label: "1440px", width: 1440, height: 1000 },
  { label: "390px", width: 390, height: 844 },
]) {
  test.describe(`The series cards at ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await mockPrice(page);
      await page.goto("/");
    });

    const card = (page: Page, part: number) => page.locator(".bp-series-grid > li").nth(part - 1);

    test("Part 1 is published: the chip, the date, and a See it → link that opens the post", async ({ page }) => {
      const part1 = card(page, 1);
      await expect(part1).toContainText("Part 1");
      await expect(part1.locator(".bp-chip")).toHaveText("Published");
      await expect(part1).toContainText("Oct 4, 2026");
      await expect(part1).not.toContainText("Not yet published");

      const link = part1.getByRole("link", { name: "See it →" });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", POST_1);
    });

    test("the Published chip is the design's lime, not grey", async ({ page }) => {
      const colours = await page.evaluate(() => {
        const resolve = (value: string, property: "backgroundColor" | "color"): string => {
          const probe = document.createElement("span");
          probe.style[property] = value;
          document.body.appendChild(probe);
          const resolved = getComputedStyle(probe)[property];
          probe.remove();
          return resolved;
        };
        const chip = document.querySelector(".bp-series-grid > li:nth-child(1) .bp-chip")!;
        const style = getComputedStyle(chip);
        return {
          background: style.backgroundColor,
          color: style.color,
          lime: resolve("var(--lime-glow)", "backgroundColor"),
          limeForeground: resolve("var(--lime-glow-foreground)", "color"),
        };
      });
      expect(colours.background).toBe(colours.lime);
      expect(colours.color).toBe(colours.limeForeground);
    });

    test("Part 2 is next: the Next chip, no date and no link", async ({ page }) => {
      const part2 = card(page, 2);
      await expect(part2).toContainText("Part 2");
      await expect(part2.locator(".bp-chip")).toHaveText("Next");
      await expect(part2).toContainText("Not yet published");
      await expect(part2.getByRole("link")).toHaveCount(0);
    });

    test("Parts 3 to 6 are planned, with no date and no link", async ({ page }) => {
      for (const part of [3, 4, 5, 6]) {
        await expect(card(page, part).locator(".bp-chip")).toHaveText("Planned");
        await expect(card(page, part)).toContainText("Not yet published");
        await expect(card(page, part).getByRole("link")).toHaveCount(0);
      }
    });

    test("the post is the only link out of the series cards", async ({ page }) => {
      const hrefs = await page.locator(".bp-series-grid a").evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")));
      expect(hrefs).toEqual([POST_1]);
    });
  });
}
