import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { mockHeavyTerminal } from "./terminalFixture.js";

// Set SCREENSHOT_DIR to keep pictures of the terminal with a long order history, at 1440x900 and 390 wide, in both themes: the design-fidelity review's before and after.
// Without it this spec does nothing; the page's layout is asserted in terminal-design.spec.ts, and here only that each picture was written.
const dir = process.env.SCREENSHOT_DIR;
const label = process.env.SCREENSHOT_LABEL ?? "after";

async function shoot(page: Page, name: string, full: boolean): Promise<void> {
  mkdirSync(dir!, { recursive: true });
  await page.screenshot({ path: join(dir!, `${label}-${name}.png`), fullPage: full });
}

const written = (name: string): number => statSync(join(dir!, `${label}-${name}.png`)).size;

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  for (const theme of ["light", "dark"]) {
    test(`screenshots ${label} ${viewport.width} ${theme}`, async ({ page }) => {
      test.skip(!dir, "SCREENSHOT_DIR is not set");
      await page.setViewportSize(viewport);
      await page.addInitScript((t) => localStorage.setItem("bp-theme", t), theme);
      await mockHeavyTerminal(page);
      await page.goto("/");
      await page.getByRole("heading", { name: "Positions" }).waitFor();
      await page.waitForTimeout(400);
      await shoot(page, `${viewport.width}-${theme}-viewport`, false);
      await shoot(page, `${viewport.width}-${theme}-full`, true);
      expect(written(`${viewport.width}-${theme}-viewport`), "the viewport picture was written").toBeGreaterThan(5_000);
      expect(written(`${viewport.width}-${theme}-full`), "the full-page picture was written").toBeGreaterThan(5_000);
    });
  }
}
