import { expect, test } from "@playwright/test";

const SECTION_IDS = ["series", "architecture", "decisions", "rules", "cost"];

test("landing page renders every section with no console/page errors", async ({ page }) => {
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

  // Architecture diagram actually loaded (real SVG, not a broken image).
  const archImg = page.locator("#architecture img");
  await expect(archImg).toBeVisible();
  const naturalWidth = await archImg.evaluate((img) => (img as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);

  // Decisions: all three real ADRs rendered.
  await expect(page.getByText("ADR-0001")).toBeVisible();
  await expect(page.getByText("ADR-0002")).toBeVisible();
  await expect(page.getByText("ADR-0003")).toBeVisible();

  // Rules: the real check:arch result is rendered (pass or fail, but present).
  await expect(page.getByText(/PASSED|FAILED/)).toBeVisible();

  // Cost: the honest "not yet measured" pending state, not invented numbers.
  await expect(page.getByText("not yet measured").first()).toBeVisible();

  // Footer
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.locator("footer")).toContainText("Architecting Software in 2026");

  expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual([]);
  expect(pageErrors, `page errors: ${pageErrors.join("; ")}`).toEqual([]);
});
