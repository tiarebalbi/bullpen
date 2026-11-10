import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { mockHeavyTerminal } from "./terminalFixture.js";

// Set SCREENSHOT_DIR to keep pictures of /account, /admin/handles (the fixture route, made-up data) and the leaderboard with a handle in review, at 1440x900 and 390 wide, in
// both themes. SCREENSHOT_LABEL names the set ("before" or "after"). Without SCREENSHOT_DIR this does nothing; the layout is asserted in account-admin.spec.ts.
const dir = process.env.SCREENSHOT_DIR;
const label = process.env.SCREENSHOT_LABEL ?? "after";

async function prepare(page: Page, theme: string): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem("bp-theme", t), theme);
  await mockHeavyTerminal(page);
  // the signed-in player's own row (a3), with a handle in review
  const rows = Array.from({ length: 12 }, (_, i) => ({ accountId: `a${i}`, handle: i === 3 ? "Player 4F2A" : `Player ${(0x1000 + i * 137).toString(16).toUpperCase()}`, cash: "50000", positionsValue: String(90000 - i * 4000), equity: String(140000 - i * 4000), rank: i + 1 }));
  await page.route("**/api/leaderboard", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows, total: 12, asOf: new Date().toISOString(), ageMs: 0, stale: false, lastFailure: null, viewer: { accountId: "a3", handle: { status: "review", approved: null } } }) }),
  );
}

const sizes = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
for (const size of sizes) {
  for (const theme of ["light", "dark"]) {
    for (const screen of ["account", "admin", "leaderboard"] as const) {
      test(`screenshots ${label} ${screen} ${size.width} ${theme}`, async ({ page }) => {
        test.skip(!dir, "SCREENSHOT_DIR is not set");
        await page.setViewportSize(size);
        await prepare(page, theme);
        await page.goto(screen === "leaderboard" ? "/" : `/e2e-fixtures/${screen}`);
        await page.waitForTimeout(500);
        mkdirSync(dir!, { recursive: true });
        const path = join(dir!, `${label}-${screen}-${size.width}-${theme}.png`);
        if (screen === "leaderboard") await page.getByRole("region", { name: "Leaderboard" }).screenshot({ path });
        else await page.screenshot({ path, fullPage: true });
        expect(statSync(path).size, "the picture was written").toBeGreaterThan(3_000);
      });
    }
  }
}
