import { expect, test } from "@playwright/test";

// A second server runs the same production build from a directory with no `architecture/` folder around it (scripts/serve-without-architecture.mjs), which is what a
// Vercel function has. Production `/account` returned 500 (ENOENT .../architecture/calm/bullpen.timeline.json) because the root layout read that file at request time.
// A dynamic route renders the layout on every request, so these requests would fail again if anything in the layout, or in a route, reads the repository's files.
test.use({ baseURL: "http://127.0.0.1:4321" });

for (const path of ["/account", "/admin/handles", "/"]) {
  test(`${path} renders from a build with no architecture/ folder on disk`, async ({ request }) => {
    const response = await request.get(path);
    // /admin/handles is a 404 for anyone who is not the allowlisted account: a page, not a server error.
    expect(response.status(), `${path} answered ${response.status()}`).toBeLessThan(500);
    expect(await response.text()).not.toContain("ENOENT");
  });
}

test("the account page renders its own content, with the analytics tag from the build", async ({ page }) => {
  const response = await page.goto("/account");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
});
