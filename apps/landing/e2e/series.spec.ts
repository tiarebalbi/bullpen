import { expect, test, type Page } from "@playwright/test";

// The series section as it stands: Parts 1 to 4 published, each with its date and a link that opens its post; the bonus (ADR-0027) next, between
// Part 4 and Part 5, planned for Nov 11; Parts 5 and 6 planned, with their planned dates. The facts are the ones in content/series.json.

const POST_1 = "https://tiarebalbi.com/en/blog/when-to-use-microservices-2026";
const POST_2 = "https://tiarebalbi.com/en/blog/architecture-as-code-describe-govern-remember";
const POST_3 = "https://tiarebalbi.com/en/blog/database-per-service-free-tier-data-ownership";
const POST_4 = "https://tiarebalbi.com/en/blog/saga-pattern-time-not-services";

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

    // A numbered part's card, found by its label: the bonus sits between Part 4 and Part 5, so a card's place is not its part number.
    const card = (page: Page, part: number) => page.locator(".bp-series-grid > li", { hasText: new RegExp(`Part ${part}(?!\\d)`) });
    const bonus = (page: Page) => page.locator('.bp-series-grid > li:has([data-kind="bonus"])');

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
        return [1, 2, 3].map((part) => {
          const style = getComputedStyle(document.querySelector(`.bp-series-grid > li:nth-child(${part}) .bp-chip`)!);
          return { background: style.backgroundColor, color: style.color, lime, limeForeground };
        });
      });
      for (const chip of colours) {
        expect(chip.background).toBe(chip.lime);
        expect(chip.color).toBe(chip.limeForeground);
      }
    });

    test("Part 3 is published, links its post and shows its publish date", async ({ page }) => {
      const part3 = card(page, 3);
      await expect(part3).toContainText("Part 3");
      await expect(part3.locator(".bp-chip")).toHaveText("Published");
      await expect(part3.getByRole("link")).toHaveAttribute("href", POST_3);
      await expect(part3).not.toContainText("Not yet published");
      await expect(part3).toContainText("Oct 19, 2026");
      await expect(part3).not.toContainText("PUBLISH_DATE_PLACEHOLDER");
      await expect(part3).not.toContainText(/Invalid|NaN/);
    });

    test("Part 4 is published, links its post and shows its publish date", async ({ page }) => {
      const part4 = card(page, 4);
      await expect(part4).toContainText("Part 4");
      await expect(part4.locator(".bp-chip")).toHaveText("Published");
      await expect(part4.getByRole("link")).toHaveAttribute("href", POST_4);
      await expect(part4).not.toContainText("Not yet published");
      await expect(part4).toContainText("Oct 26, 2026");
      await expect(part4).not.toContainText(/Invalid|NaN/);
    });

    test("the heading is 'Six parts and a bonus, one system'", async ({ page }) => {
      await expect(page.getByRole("heading", { level: 2, name: "Six parts and a bonus, one system" })).toBeVisible();
    });

    test("there are seven cards, with the bonus between Part 4 and Part 5", async ({ page }) => {
      const cards = page.locator(".bp-series-grid > li");
      await expect(cards).toHaveCount(7);
      await expect(cards.nth(3)).toContainText("Part 4");
      await expect(cards.nth(4).locator('[data-kind="bonus"]')).toHaveCount(1);
      await expect(cards.nth(5)).toContainText("Part 5");
    });

    test("the bonus is next: a diamond and 'Bonus · Detour' instead of a part number, 'Planned · Nov 11', no link", async ({ page }) => {
      const card_ = bonus(page);
      await expect(card_).toContainText("Bonus · Detour");
      await expect(card_.locator("svg[aria-hidden='true']")).toHaveCount(1);
      await expect(card_).not.toContainText(/Part \d/);
      await expect(card_).toContainText("Changing the plan mid-flight");
      await expect(card_).toContainText("Player handles, moderated through a planned change");
      await expect(card_.locator(".bp-chip")).toHaveText("Next");
      await expect(card_.locator("time")).toHaveText("Planned · Nov 11");
      await expect(card_.locator("time")).toHaveAttribute("datetime", "2026-11-11");
      await expect(card_).not.toContainText("Not yet published");
      await expect(card_.getByRole("link")).toHaveCount(0);
    });

    test("the bonus wears the accent as a dashed border, in a card the same height as its neighbours", async ({ page }) => {
      const measured = await page.evaluate(() => {
        const bonusCard = document.querySelector<HTMLElement>('.bp-series-card[data-kind="bonus"]')!;
        const partCard = document.querySelector<HTMLElement>('.bp-series-card[data-kind="part"]')!;
        const probe = document.createElement("span");
        probe.style.color = "var(--ember)";
        document.body.appendChild(probe);
        const ember = getComputedStyle(probe).color;
        probe.remove();
        const style = getComputedStyle(bonusCard);
        return { borderStyle: style.borderTopStyle, borderColor: style.borderTopColor, ember, partBorderStyle: getComputedStyle(partCard).borderTopStyle, bonusHeight: bonusCard.getBoundingClientRect().height, partHeight: partCard.getBoundingClientRect().height };
      });
      expect(measured.borderStyle).toBe("dashed");
      expect(measured.borderColor).toBe(measured.ember);
      expect(measured.partBorderStyle).toBe("solid");
      expect(measured.bonusHeight).toBe(measured.partHeight);
    });

    for (const planned of [
      { part: 5, date: "Nov 23" },
      { part: 6, date: "Nov 30" },
    ]) {
      test(`Part ${planned.part} is planned: the Planned chip, a planned date set apart from a publish date, no link`, async ({ page }) => {
        const card_ = card(page, planned.part);
        await expect(card_.locator(".bp-chip")).toHaveText("Planned");
        await expect(card_.locator("time")).toContainText(planned.date);
        await expect(card_.locator("time")).toContainText("Planned for");
        await expect(card_.locator("time")).toHaveCSS("border-top-style", "dashed");
        await expect(card_).not.toContainText(/Nov \d+, 2026/);
        await expect(card_.getByRole("link")).toHaveCount(0);
      });
    }

    test("a published card shows no planned date", async ({ page }) => {
      for (const part of [1, 2, 3, 4]) await expect(card(page, part).locator("time")).toHaveCount(0);
    });

    test("the four posts are the only links out of the series cards", async ({ page }) => {
      const hrefs = await page.locator(".bp-series-grid a").evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")));
      expect(hrefs).toEqual([POST_1, POST_2, POST_3, POST_4]);
    });
  });
}
