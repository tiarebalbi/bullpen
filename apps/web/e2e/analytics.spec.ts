import { expect, test, type Page } from "@playwright/test";

// The server under test is built with VERCEL_ENV=production and dummy ids
// (see playwright.config.ts), so the tags are allowed to load. Every request
// to Google or Clarity is intercepted and answered with an empty script:
// nothing here ever reaches a real analytics service.
const ANALYTICS_HOST = /(googletagmanager\.com|google-analytics\.com|clarity\.ms)/;
const COOKIE_ANALYTICS = /^(_ga|_gid|_clck|_clsk)/;
const PRIVACY_URL = "https://bullpen.tiarebalbi.com/privacy";

// A fresh visitor: no consent cookie (the config's default is a rejection, so
// the other specs are not covered by the banner).
test.use({ storageState: { cookies: [], origins: [] } });

async function interceptAnalytics(page: Page): Promise<string[]> {
  const hits: string[] = [];
  await page.route(ANALYTICS_HOST, (route) => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
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
  return hits;
}

const banner = (page: Page) => page.getByRole("region", { name: "Analytics and cookies" });

async function analyticsCookies(page: Page): Promise<string[]> {
  return (await page.context().cookies()).map((c) => c.name).filter((name) => COOKIE_ANALYTICS.test(name));
}

async function consentCookie(page: Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((c) => c.name === "bullpen_consent")?.value;
}

const dataLayer = (page: Page) =>
  page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((a) => Array.from(a)));

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`analytics consent in the trading app at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("the banner shows on the first visit, links to the privacy page, and nothing has loaded or been set", async ({
      page,
    }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");

      await expect(banner(page)).toBeVisible();
      await expect(banner(page).getByRole("button", { name: "Accept" })).toBeVisible();
      await expect(banner(page).getByRole("button", { name: "Reject" })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "privacy page" })).toHaveAttribute("href", PRIVACY_URL);
      await expect(page.locator("footer").getByRole("link", { name: "Privacy" })).toHaveAttribute("href", PRIVACY_URL);

      await page.waitForLoadState("networkidle");
      expect(hits).toEqual([]);
      expect(await analyticsCookies(page)).toEqual([]);
      expect(await consentCookie(page)).toBeUndefined();
    });

    test("it does not cover content or overflow the page", async ({ page }) => {
      await interceptAnalytics(page);
      await page.goto("/");
      await expect(banner(page)).toBeVisible();
      await expect(page.getByTestId("price-cell-price")).toBeVisible();

      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const settings = page.getByRole("button", { name: "Cookie settings" });
      await expect(settings).toBeVisible();
      await expect
        .poll(async () => {
          const [b, s] = await Promise.all([banner(page).boundingBox(), settings.boundingBox()]);
          return s!.y + s!.height <= b!.y + 0.5;
        })
        .toBe(true);
      expect((await banner(page).boundingBox())!.height).toBeLessThan(viewport.height * 0.35);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test("Reject: no request to Google or Clarity, no analytics cookies, and it stays rejected", async ({ page }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Reject" }).click();
      await expect(banner(page)).toBeHidden();

      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(banner(page)).toBeHidden();
      expect(hits).toEqual([]);
      expect(await analyticsCookies(page)).toEqual([]);
      expect(await consentCookie(page)).toBe("rejected");
    });

    test("Accept: both tags request, consent defaults come first, one page view, and the choice persists", async ({
      page,
    }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Accept" }).click();

      await expect.poll(() => hits.some((h) => h.includes("googletagmanager.com/gtag/js?id=G-TEST000000"))).toBe(true);
      await expect.poll(() => hits.some((h) => h.includes("clarity.ms/tag/clar1tytest"))).toBe(true);

      const calls = await dataLayer(page);
      expect(calls[0]).toEqual([
        "consent",
        "default",
        { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" },
      ]);
      expect(calls[1]).toEqual(["consent", "update", { analytics_storage: "granted" }]);
      expect(calls.filter((c) => c[0] === "event" && c[1] === "page_view")).toHaveLength(1);

      const clarity = await page.evaluate(() =>
        ((window as unknown as { clarity?: { q?: ArrayLike<unknown>[] } }).clarity?.q ?? []).map((a) => Array.from(a)),
      );
      expect(clarity[0]).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }]);
      expect(clarity[1]).toEqual(["set", "part", expect.stringMatching(/^[1-6]$/)]);
      expect(await consentCookie(page)).toBe("accepted");

      hits.length = 0;
      await page.reload();
      await expect(banner(page)).toBeHidden();
      await expect.poll(() => hits.some((h) => h.includes("gtag/js"))).toBe(true);
      await expect.poll(() => hits.some((h) => h.includes("clarity.ms/tag"))).toBe(true);

      // Another navigation to the same app keeps the choice.
      await page.goto("/?again=1");
      await expect(banner(page)).toBeHidden();
      expect(await consentCookie(page)).toBe("accepted");
    });

    test("an outbound link is sent as its host only", async ({ page }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Accept" }).click();
      await expect.poll(() => hits.some((h) => h.includes("gtag/js"))).toBe(true);

      const credit = page.getByRole("link", { name: "Powered by CoinGecko" });
      await credit.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault()));
      await credit.click();
      const outbound = (await dataLayer(page)).find((c) => c[0] === "event" && c[1] === "outbound_click");
      expect(outbound?.[2]).toEqual({ host: "www.coingecko.com" });
    });

    test("Cookie settings reopens the banner, and withdrawing stops the tools and clears their cookies", async ({
      page,
      baseURL,
    }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Accept" }).click();
      await expect.poll(() => hits.some((h) => h.includes("gtag/js"))).toBe(true);

      await page.context().addCookies(
        ["_ga", "_ga_TEST000000", "_clck", "_clsk"].map((name) => ({ name, value: "x", url: baseURL! })),
      );
      expect((await analyticsCookies(page)).length).toBe(4);

      await page.getByRole("button", { name: "Cookie settings" }).click();
      await expect(banner(page)).toBeVisible();
      await expect(banner(page)).toBeFocused();

      const reloaded = page.waitForEvent("load");
      await banner(page).getByRole("button", { name: "Reject" }).click();
      await reloaded;

      await expect(banner(page)).toBeHidden();
      expect(await analyticsCookies(page)).toEqual([]);
      expect(await consentCookie(page)).toBe("rejected");

      hits.length = 0;
      await page.waitForLoadState("networkidle");
      expect(hits).toEqual([]);
    });
  });
}
