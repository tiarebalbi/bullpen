import { expect, test, type Page } from "@playwright/test";

// The series section as it stands once Part 2 is out: Parts 1 and 2 published, each with its date and a
// link that opens its post; Part 3 next; the rest planned. The facts are the ones in content/series.json.

const POST_1 = "https://tiarebalbi.com/en/blog/when-to-use-microservices-2026";
const POST_2 = "https://tiarebalbi.com/en/blog/architecture-as-code-describe-govern-remember";

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

    for (const published of [
      { part: 1, date: "Oct 4, 2026", post: POST_1 },
      { part: 2, date: "Oct 11, 2026", post: POST_2 },
    ]) {
      test(`Part ${published.part} is published: the chip, the date, and a See it → link that opens the post`, async ({ page }) => {
        const published_ = card(page, published.part);
        await expect(published_).toContainText(`Part ${published.part}`);
        await expect(published_.locator(".bp-chip")).toHaveText("Published");
        await expect(published_).toContainText(published.date);
        await expect(published_).not.toContainText("Not yet published");

        const link = published_.getByRole("link", { name: "See it →" });
        await expect(link).toHaveCount(1);
        await expect(link).toHaveAttribute("href", published.post);
      });
    }

    test("the Published chips are the design's lime, not grey", async ({ page }) => {
      const colours = await page.evaluate(() => {
        const resolve = (value: string, property: "backgroundColor" | "color"): string => {
          const probe = document.createElement("span");
          probe.style[property] = value;
          document.body.appendChild(probe);
          const resolved = getComputedStyle(probe)[property];
          probe.remove();
          return resolved;
        };
        const lime = resolve("var(--lime-glow)", "backgroundColor");
        const limeForeground = resolve("var(--lime-glow-foreground)", "color");
        return [1, 2].map((part) => {
          const style = getComputedStyle(document.querySelector(`.bp-series-grid > li:nth-child(${part}) .bp-chip`)!);
          return { background: style.backgroundColor, color: style.color, lime, limeForeground };
        });
      });
      for (const chip of colours) {
        expect(chip.background).toBe(chip.lime);
        expect(chip.color).toBe(chip.limeForeground);
      }
    });

    test("Part 3 is next: the Next chip, no date and no link", async ({ page }) => {
      const part3 = card(page, 3);
      await expect(part3).toContainText("Part 3");
      await expect(part3.locator(".bp-chip")).toHaveText("Next");
      await expect(part3).toContainText("Not yet published");
      await expect(part3.getByRole("link")).toHaveCount(0);
    });

    test("Parts 4 to 6 are planned, with no date and no link", async ({ page }) => {
      for (const part of [4, 5, 6]) {
        await expect(card(page, part).locator(".bp-chip")).toHaveText("Planned");
        await expect(card(page, part)).toContainText("Not yet published");
        await expect(card(page, part).getByRole("link")).toHaveCount(0);
      }
    });

    test("the two posts are the only links out of the series cards", async ({ page }) => {
      const hrefs = await page.locator(".bp-series-grid a").evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")));
      expect(hrefs).toEqual([POST_1, POST_2]);
    });
  });
}
