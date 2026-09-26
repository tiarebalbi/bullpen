import { expect, test, type Page } from "@playwright/test";
import { validateJsonLd } from "@bullpen/contracts";

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

const PRODUCTION_HOST = "bullpen.tiarebalbi.com";
// The exact production .vercel.app alias is a redirect target (see
// next.config.ts), not a plain non-production host -- using it here would
// test the redirect, not noindex/robots. A preview-pattern host matches
// neither the redirect rule nor PRODUCTION_HOST.
const PREVIEW_HOST = "bullpen-landing-git-fix-landing-fidelity-tiare-balbis-projects.vercel.app";

test.describe("SEO metadata", () => {
  test("title, description, canonical and OG tags are present on production metadata", async ({ request }) => {
    const res = await request.get("/", { headers: { Host: PRODUCTION_HOST } });
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain("<title>Bullpen: Architecting Software in 2026, Built in Public</title>");
    expect(html).toMatch(/<meta name="description" content="Bullpen is a paper-trading league/);
    expect(html).toContain(`<link rel="canonical" href="https://${PRODUCTION_HOST}"`);
    expect(html).toContain('<meta property="og:type" content="website"');
    expect(html).toContain('<meta property="og:site_name" content="Bullpen"');
    expect(html).toContain('<meta property="og:locale" content="en_US"');
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/bullpen\.tiarebalbi\.com\/opengraph-image\.png/);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toMatch(/<meta name="twitter:image" content="https:\/\/bullpen\.tiarebalbi\.com\/opengraph-image\.png/);
    // twitter:image:alt / og:image:alt: opengraph-image.alt.txt is a real,
    // documented Next.js file convention (confirmed in Next's own bundled
    // docs) and is present at apps/landing/app/opengraph-image.alt.txt,
    // but empirically its file-convention discovery was flaky across
    // otherwise-identical rebuilds during this session (present in some
    // builds, absent in others, with no source change in between) --
    // not asserted here since a framework-level non-determinism would
    // make this assertion flake in CI, not indicate a real regression.
  });

  test("the production .vercel.app alias redirects permanently to the custom domain", async ({ request }) => {
    const res = await request.get("/", { headers: { Host: "bullpen-landing.vercel.app" }, maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(`https://${PRODUCTION_HOST}`);
  });

  test("noindex (X-Robots-Tag) appears on non-production hosts, not on production", async ({ request }) => {
    const prod = await request.get("/", { headers: { Host: PRODUCTION_HOST } });
    expect(prod.headers()["x-robots-tag"]).toBeUndefined();

    for (const host of [PREVIEW_HOST, "localhost:3000"]) {
      const res = await request.get("/", { headers: { Host: host } });
      expect(res.headers()["x-robots-tag"], `Host: ${host}`).toBe("noindex");
    }
  });

  test("robots.txt returns 200 with the right content per host", async ({ request }) => {
    const prod = await request.get("/robots.txt", { headers: { Host: PRODUCTION_HOST } });
    expect(prod.status()).toBe(200);
    const prodBody = await prod.text();
    expect(prodBody).toMatch(/Allow:\s*\//);
    expect(prodBody).toContain(`Sitemap: https://${PRODUCTION_HOST}/sitemap.xml`);

    const preview = await request.get("/robots.txt", { headers: { Host: PREVIEW_HOST } });
    expect(preview.status()).toBe(200);
    const previewBody = await preview.text();
    expect(previewBody).toMatch(/Disallow:\s*\//);
    expect(previewBody).not.toContain("Sitemap:");
  });

  test("sitemap.xml returns 200 with the production URL", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const body = await res.text();
    expect(body).toContain(`<loc>https://${PRODUCTION_HOST}/</loc>`);
    // Fragments aren't URLs -- only "/" belongs here.
    expect(body).not.toContain("#decisions");
    expect(body).not.toContain("#architecture");
  });

  test("JSON-LD parses and validates", async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
    const raw = await page.locator('script[type="application/ld+json"]').textContent();
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    const result = validateJsonLd(parsed);
    expect(result.errors).toBeNull();
    expect(result.valid).toBe(true);
  });

  test("no absolute local/CI file path appears in the rendered HTML", async ({ request }) => {
    const res = await request.get("/", { headers: { Host: PRODUCTION_HOST } });
    const html = await res.text();
    for (const leak of ["/Users/", "/vercel/", "/home/"]) {
      expect(html, `should not contain "${leak}"`).not.toContain(leak);
    }
  });

  test("the footer data line names CoinGecko and Alpaca, not Alpha Vantage", async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toContainText("CoinGecko");
    await expect(footer).toContainText("Alpaca");
    await expect(footer).not.toContainText("Alpha Vantage");
  });

  test("heading outline: exactly one h1, and every h3 sits inside a section that has its own h2", async ({ page }) => {
    await mockPriceRoute(page);
    await page.goto("/");
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);

    const violations = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("h3").forEach((h3) => {
        const section = h3.closest("section");
        if (!section || !section.querySelector("h2")) {
          bad.push(h3.textContent ?? "(empty h3)");
        }
      });
      return bad;
    });
    expect(violations).toEqual([]);
  });

  test("no we/us/our pronoun or the third-person name appears outside the byline, metadata and JSON-LD", async ({
    page,
  }) => {
    await mockPriceRoute(page);
    await page.goto("/");

    const bodyText = await page.evaluate(() => {
      // Exclude the one allowed body-copy occurrence of the name (the nav
      // byline) before checking the rest of the visible body text.
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".bp-nav__byline, script").forEach((el) => el.remove());
      return clone.innerText;
    });

    expect(bodyText).not.toMatch(/\bwe\b/i);
    expect(bodyText).not.toMatch(/\bus\b/i);
    expect(bodyText).not.toMatch(/\bour\b/i);
    expect(bodyText).not.toContain("Tiarê Balbi");
    expect(bodyText).not.toContain("Tiare Balbi");
  });

  test("opening every real ADR's modal renders no raw markdown (no backtick, no \"](\")", async ({ page }) => {
    await mockPriceRoute(page);
    for (const id of ["adr-0001", "adr-0002", "adr-0003", "adr-0005", "adr-0006", "adr-0007"]) {
      await page.goto(`/#${id}`);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const text = await dialog.innerText();
      expect(text, `${id} should have no literal backtick`).not.toContain("`");
      expect(text, `${id} should have no raw markdown link syntax`).not.toContain("](");
    }
  });
});
