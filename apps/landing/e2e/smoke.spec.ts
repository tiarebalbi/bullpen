import { expect, test } from "@playwright/test";

const SECTION_IDS = ["series", "architecture", "decisions", "rules", "cost"];

test("landing page renders every section with no console/page errors", async ({ page }) => {
  // The "Live prices" strip fetches apps/web's route cross-origin; mocked
  // here so this test never depends on a real, deployed external service
  // (and never trips CORS in a browser console during an unrelated smoke
  // test -- see apps/landing/e2e/fidelity.spec.ts for the strip's own
  // dedicated coverage).
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

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/");

  // Hero
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Your spot is open")).toBeVisible();

  // Every section is present.
  for (const id of SECTION_IDS) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }

  // Every nav link resolves to a real section id on the page.
  const navLinks = page.locator("nav[aria-label='Page sections'] a");
  const hrefs = await navLinks.evaluateAll((anchors) =>
    anchors.map((a) => (a as HTMLAnchorElement).getAttribute("href")),
  );
  expect(hrefs.length).toBe(SECTION_IDS.length);
  for (const href of hrefs) {
    expect(href).not.toBeNull();
    const id = (href as string).replace("#", "");
    await expect(page.locator(`#${id}`)).toBeAttached();
  }

  // Architecture explorer actually mounted (React Flow canvas, not a broken image).
  await expect(page.locator("#architecture .react-flow")).toBeVisible();
  await expect(page.locator("#architecture").getByRole("group", { name: "Series part" })).toBeVisible();

  // Decisions: all six real ADRs rendered.
  const decisions = page.locator("#decisions");
  for (const id of ["ADR-0001", "ADR-0002", "ADR-0003", "ADR-0005", "ADR-0006", "ADR-0007"]) {
    await expect(decisions.getByText(id)).toBeVisible();
  }

  // Rules: four real rule mini-cards, each with a real result chip (a
  // build-time pass/fail, or an honest "runs in CI" for checks that only
  // run there, never a fabricated pass).
  const ruleCards = page.locator("#rules .bp-rule-card");
  await expect(ruleCards).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect(ruleCards.nth(i).locator(".bp-rule-card__foot")).toContainText(/pass|fail|runs in CI/);
  }

  // Cost: the honest "usage pending" state, not invented numbers.
  await expect(page.locator("#cost-usage").getByText("usage pending").first()).toBeVisible();

  // Footer
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.locator("footer")).toContainText("Architecting Software in 2026");

  expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join("; ")}`).toEqual([]);
});
