import { expect, test } from "@playwright/test";

// Handles (ADR-0027) as a visitor who is not signed in sees them. Sign-in is not configured in this build, so no one is a player here: what these
// pin is that the pages say so plainly, that the review page does not exist for anyone but the allowlisted account, and that nothing is saved.

test.use({ viewport: { width: 1280, height: 900 } });

test("the terminal links to the account page from the footer", async ({ page }) => {
  await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "BTC-USD", price: 1, changePercent: 0, time: new Date().toISOString(), source: "coingecko", fetchedAt: new Date().toISOString() }) }));
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
});

test("the account page tells a visitor to sign in, shows no form, and keeps the neutral label", async ({ page }) => {
  await page.goto("/account");
  // the terminal's header owns the page's one h1 (Bullpen); the page's own title sits under it
  await expect(page.getByRole("heading", { level: 1, name: "Bullpen" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your account" })).toBeVisible();
  await expect(page.getByText(/Sign in with GitHub on the terminal to set a handle/)).toBeVisible();
  await expect(page.getByText(/you appear as “Player” and four characters/)).toBeVisible();
  await expect(page.getByRole("form", { name: "Set your handle" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to the terminal" })).toHaveAttribute("href", "/");
});

test("the review page does not exist for a visitor: it is the same 404 as a page that is not there", async ({ page }) => {
  const review = await page.goto("/admin/handles");
  const missing = await page.goto("/admin/no-such-page");
  expect(review!.status()).toBe(404);
  expect(missing!.status()).toBe(404);
});

test("saving a handle, reading it and reviewing one all refuse a visitor, and say why in JSON", async ({ request }) => {
  const save = await request.post("/api/handle", { data: { handle: "BullRun" } });
  const read = await request.get("/api/handle");
  const review = await request.post("/api/admin/handles/0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11", { data: { action: "approve" } });
  for (const response of [save, read, review]) {
    expect([401, 503]).toContain(response.status());
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/^sign-in-(required|unavailable)$/) });
  }
});
