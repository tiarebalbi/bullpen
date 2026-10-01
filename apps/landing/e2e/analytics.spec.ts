import { expect, test, type Page } from "@playwright/test";

// The servers under test are built with VERCEL_ENV=production and dummy ids
// (see playwright.config.ts), so the tags are allowed to load. Every request
// to Google or Clarity is intercepted and answered with an empty script:
// nothing here ever reaches a real analytics service.
const ANALYTICS_HOST = /(googletagmanager\.com|google-analytics\.com|clarity\.ms)/;
const COOKIE_ANALYTICS = /^(_ga|_gid|_clck|_clsk)/;

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
  test.describe(`analytics consent at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("the banner shows on the first visit, and nothing has loaded or been set", async ({ page }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");

      await expect(banner(page)).toBeVisible();
      await expect(banner(page).getByRole("button", { name: "Accept" })).toBeVisible();
      await expect(banner(page).getByRole("button", { name: "Reject" })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "privacy page" })).toHaveAttribute("href", "/privacy");

      await page.waitForLoadState("networkidle");
      expect(hits).toEqual([]);
      expect(await analyticsCookies(page)).toEqual([]);
      expect(await consentCookie(page)).toBeUndefined();
      await expect(page.locator("script[src*='googletagmanager'], script[src*='clarity.ms']")).toHaveCount(0);
    });

    test("Accept and Reject look the same, are reachable by keyboard and show where focus is", async ({ page }) => {
      await interceptAnalytics(page);
      await page.goto("/");
      const reject = banner(page).getByRole("button", { name: "Reject" });
      const accept = banner(page).getByRole("button", { name: "Accept" });

      const [a, r] = await Promise.all([accept.boundingBox(), reject.boundingBox()]);
      expect(Math.abs(a!.width - r!.width)).toBeLessThan(40);
      expect(a!.height).toBe(r!.height);

      await reject.focus();
      await page.keyboard.press("Tab");
      await expect(accept).toBeFocused();
      const outline = await accept.evaluate((el) => {
        const style = getComputedStyle(el);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
      expect(outline.style).not.toBe("none");
      expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Enter");
      await expect(banner(page)).toBeHidden();
      expect(await consentCookie(page)).toBe("rejected");
    });

    test("it does not cover content or overflow the page", async ({ page }) => {
      await interceptAnalytics(page);
      await page.goto("/");
      await expect(banner(page)).toBeVisible();

      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const settings = page.getByRole("button", { name: "Cookie settings" });
      await expect(settings).toBeVisible();
      // The banner reserves its own height at the bottom of the page, so the
      // last thing on the page ends above the banner, not behind it.
      await expect
        .poll(async () => {
          const [b, s] = await Promise.all([banner(page).boundingBox(), settings.boundingBox()]);
          return s!.y + s!.height <= b!.y + 0.5;
        })
        .toBe(true);

      const box = (await banner(page).boundingBox())!;
      expect(box.height).toBeLessThan(viewport.height * 0.35);
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
      await expect(page.locator("script[src*='googletagmanager'], script[src*='clarity.ms']")).toHaveCount(0);
    });

    test("Accept: both tags request, consent defaults come first, and the choice persists", async ({ page }) => {
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
      for (const call of calls) {
        if (call[0] !== "consent") continue;
        const signals = call[2] as Record<string, string>;
        for (const key of ["ad_storage", "ad_user_data", "ad_personalization"]) expect(signals[key] ?? "denied").toBe("denied");
      }
      const clarity = await page.evaluate(() =>
        ((window as unknown as { clarity?: { q?: ArrayLike<unknown>[] } }).clarity?.q ?? []).map((a) => Array.from(a)),
      );
      expect(clarity[0]).toEqual(["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }]);
      expect(clarity[1]).toEqual(["set", "part", expect.stringMatching(/^[1-6]$/)]);

      const cookie = (await page.context().cookies()).find((c) => c.name === "bullpen_consent")!;
      expect(cookie.value).toBe("accepted");
      expect(cookie.sameSite).toBe("Lax");
      const monthsInSeconds = 60 * 60 * 24 * 30;
      expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(monthsInSeconds * 5.9);
      expect(cookie.expires - Date.now() / 1000).toBeLessThan(monthsInSeconds * 6.2);

      // Persists: no banner after a reload, and the tags load again.
      hits.length = 0;
      await page.reload();
      await expect(banner(page)).toBeHidden();
      await expect.poll(() => hits.some((h) => h.includes("gtag/js"))).toBe(true);
      await expect.poll(() => hits.some((h) => h.includes("clarity.ms/tag"))).toBe(true);
    });

    test("a client-side route change counts one page view, and the choice survives it", async ({ page }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Accept" }).click();
      await expect.poll(() => hits.some((h) => h.includes("gtag/js"))).toBe(true);

      await page.evaluate(() => {
        (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
      });
      await page.getByRole("link", { name: "Privacy", exact: true }).click();
      await expect(page).toHaveURL(/\/privacy$/);
      await expect(page.getByRole("heading", { level: 1, name: "What I collect, and why" })).toBeVisible();
      // Same document: this was a client-side transition, not a reload.
      expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
      await expect(banner(page)).toBeHidden();

      const views = (await dataLayer(page))
        .filter((c) => c[0] === "event" && c[1] === "page_view")
        .map((c) => (c[2] as { page_path: string }).page_path);
      expect(views).toEqual(["/", "/privacy"]);
      expect(await consentCookie(page)).toBe("accepted");
    });

    test("an ADR opening and an outbound click are sent as events, with nothing personal in them", async ({ page }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Accept" }).click();
      await expect.poll(() => hits.some((h) => h.includes("gtag/js"))).toBe(true);

      await page.evaluate(() => {
        window.location.hash = "#adr-0001";
      });
      await expect
        .poll(async () => (await dataLayer(page)).some((c) => c[1] === "adr_open"))
        .toBe(true);
      await page.keyboard.press("Escape");

      // A link to another site: stop the navigation, the click handler has run by then.
      await page.evaluate(() => {
        const a = document.createElement("a");
        a.href = "https://example.com/some/path?q=secret";
        a.id = "probe-outbound";
        a.textContent = "probe";
        a.addEventListener("click", (e) => e.preventDefault());
        document.body.appendChild(a);
      });
      await page.locator("#probe-outbound").click();
      const events = (await dataLayer(page)).filter((c) => c[0] === "event" && typeof c[1] === "string");
      const adr = events.find((c) => c[1] === "adr_open")!;
      expect(adr[2]).toEqual({ adr_number: 1 });
      const outbound = events.find((c) => c[1] === "outbound_click")!;
      expect(outbound[2]).toEqual({ host: "example.com" });
    });

    test("Cookie settings reopens the banner, and withdrawing stops the tools and clears their cookies", async ({
      page,
      baseURL,
    }) => {
      const hits = await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Accept" }).click();
      await expect.poll(() => hits.some((h) => h.includes("gtag/js"))).toBe(true);

      // What the tools would have written, planted by hand: the intercepted
      // scripts are empty, so they set nothing themselves.
      await page.context().addCookies(
        ["_ga", "_ga_TEST000000", "_clck", "_clsk"].map((name) => ({ name, value: "x", url: baseURL! })),
      );
      expect((await analyticsCookies(page)).length).toBe(4);

      await page.getByRole("button", { name: "Cookie settings" }).click();
      await expect(banner(page)).toBeVisible();
      await expect(banner(page)).toBeFocused();
      await expect(banner(page).getByText("You have accepted analytics.")).toBeVisible();

      const reloaded = page.waitForEvent("load");
      await banner(page).getByRole("button", { name: "Reject" }).click();
      await reloaded;

      await expect(banner(page)).toBeHidden();
      expect(await analyticsCookies(page)).toEqual([]);
      expect(await consentCookie(page)).toBe("rejected");

      hits.length = 0;
      await page.waitForLoadState("networkidle");
      expect(hits).toEqual([]);
      await expect(page.locator("script[src*='googletagmanager'], script[src*='clarity.ms']")).toHaveCount(0);
    });

    test("Cookie settings can be closed without changing the choice, and focus goes back to the link", async ({ page }) => {
      await interceptAnalytics(page);
      await page.goto("/");
      await banner(page).getByRole("button", { name: "Reject" }).click();

      const settings = page.getByRole("button", { name: "Cookie settings" });
      await settings.click();
      await expect(banner(page).getByText("You have rejected analytics.")).toBeVisible();
      await banner(page).getByRole("button", { name: "Close" }).click();
      await expect(banner(page)).toBeHidden();
      await expect(settings).toBeFocused();
      expect(await consentCookie(page)).toBe("rejected");
    });
  });

  test.describe(`/privacy at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("renders, with its own title and canonical, and its links", async ({ page }) => {
      await interceptAnalytics(page);
      await page.goto("/privacy");
      await expect(page.getByRole("heading", { level: 1, name: "What I collect, and why" })).toBeVisible();
      await expect(page).toHaveTitle("Privacy: what Bullpen collects, and why");
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://bullpen.tiarebalbi.com/privacy");
      await expect(page.getByRole("heading", { name: "Advertising is off" })).toBeVisible();
      await expect(page.getByRole("link", { name: "my site" })).toHaveAttribute("href", "https://tiarebalbi.com");
      await expect(page.getByRole("button", { name: "Cookie settings" })).toBeVisible();
      for (const cookie of ["bullpen_consent", "_ga", "_clck", "_clsk"]) {
        await expect(page.getByRole("cell", { name: cookie, exact: true })).toBeVisible();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test("/privacy is in the sitemap, and the page has no email address in it", async ({ request, page }) => {
  const sitemap = await request.get("/sitemap.xml", { headers: { Host: "bullpen.tiarebalbi.com" } });
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("<loc>https://bullpen.tiarebalbi.com/privacy</loc>");

  await interceptAnalytics(page);
  await page.goto("/privacy");
  expect(await page.locator("body").innerText()).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
});
