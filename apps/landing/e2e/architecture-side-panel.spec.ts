import { expect, test, type Page } from "@playwright/test";

// The side panel keeps the diagram's height: with nothing selected (the summary and its two buttons) and with a node selected. Held at 1440 px.
test.use({ viewport: { width: 1440, height: 1000 } });

async function open(page: Page): Promise<void> {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto("/");
  await page.waitForTimeout(500);
}

const heights = async (page: Page) => {
  const canvas = (await page.locator("#architecture .bp-arch-explorer__canvas").boundingBox())!;
  const panel = (await page.locator("#architecture aside[aria-label=Details]").boundingBox())!;
  return { canvas: canvas.height, panel: panel.height, canvasTop: canvas.y, panelTop: panel.y };
};

test("with nothing selected, the side panel is as tall as the diagram and starts level with it", async ({ page }) => {
  await open(page);
  const h = await heights(page);
  expect(Math.abs(h.panel - h.canvas)).toBeLessThanOrEqual(1);
  expect(Math.abs(h.panelTop - h.canvasTop)).toBeLessThanOrEqual(1);
  await expect(page.locator("#architecture").getByLabel("Details").getByRole("button", { name: "What changed" })).toBeVisible();
  await expect(page.locator("#architecture").getByLabel("Details").getByRole("button", { name: "Traffic details" })).toBeVisible();
});

test("with a node selected, the side panel is still as tall as the diagram", async ({ page }) => {
  await open(page);
  await page.locator("#architecture").getByRole("button", { name: "Market Data Service, Service" }).click();
  await expect(page.locator("#architecture").getByLabel("Details").getByRole("button", { name: "Close details" })).toBeVisible();
  const h = await heights(page);
  expect(Math.abs(h.panel - h.canvas)).toBeLessThanOrEqual(1);
  expect(Math.abs(h.panelTop - h.canvasTop)).toBeLessThanOrEqual(1);
});

test("with a line selected, the side panel is still as tall as the diagram", async ({ page }) => {
  await open(page);
  await page.locator('#architecture .react-flow__edge[data-id="trading-app-to-trading-schema"] path.react-flow__edge-interaction').dispatchEvent("click");
  await expect(page.locator("#architecture").getByLabel("Details").locator(".bp-edge-panel__rate")).toBeVisible();
  const h = await heights(page);
  expect(Math.abs(h.panel - h.canvas)).toBeLessThanOrEqual(1);
});
