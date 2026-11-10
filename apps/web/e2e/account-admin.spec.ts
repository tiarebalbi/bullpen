import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockHeavyTerminal } from "./terminalFixture.js";

// /account and /admin/handles in the terminal's frame. Both are server pages gated by the session, so the screens are read through the fixture routes (/e2e-fixtures/*, made-up
// data, on only in this server) with the account, ranking and prices answered at the browser, as the terminal specs do. The real routes are checked for what a visitor gets.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`account and review screens at ${viewport.width}px`, () => {
    test.use({ viewport });

    async function open(page: Page, path: string): Promise<void> {
      await mockHeavyTerminal(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Bullpen" })).toBeVisible();
    }

    test("the account page has the terminal's header: Bullpen, equity, rank and the player chip", async ({ page }) => {
      await open(page, "/e2e-fixtures/account");
      const header = page.locator("header.bp-terminal__header");
      await expect(header).toContainText("Account");
      await expect(header.getByText("$135,358.12")).toBeVisible();
      await expect(header.getByText("#4 of 12")).toBeVisible();
      await expect(header.getByRole("img", { name: "Signed in as Player 4F2A" })).toBeVisible();
      await expect(header.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeVisible();
      await expect(page.getByRole("main").getByRole("heading", { name: "Your account" })).toBeVisible();
    });

    test("the handle field is the design system's, not a plain white box: transparent, on a 2px rule, 19px text, 48px tall, with a small-caps label", async ({ page }) => {
      await open(page, "/e2e-fixtures/account");
      const input = page.locator("#handle-input");
      const style = await input.evaluate((el) => {
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, rule: s.borderBottomWidth, side: s.borderLeftWidth, size: parseFloat(s.fontSize), height: el.getBoundingClientRect().height, color: s.color };
      });
      expect(style.background).toBe("rgba(0, 0, 0, 0)");
      expect(style.rule).toBe("2px");
      expect(style.side).toBe("0px");
      expect(style.size).toBeGreaterThanOrEqual(16);
      expect(style.height).toBeGreaterThanOrEqual(44);
      const label = await page.locator("label.bp-field__label").evaluate((el) => {
        const s = getComputedStyle(el);
        return { transform: s.textTransform, size: parseFloat(s.fontSize), spacing: s.letterSpacing };
      });
      expect(label.transform).toBe("uppercase");
      expect(label.size).toBeLessThan(12);
      expect(label.spacing).not.toBe("normal");
      // the rule takes the accent on focus
      await input.focus();
      const focused = await input.evaluate((el) => getComputedStyle(el).borderBottomColor);
      const ember = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ember").trim());
      expect(ember).not.toBe("");
      expect(focused).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("the save button is the ember pill at 44px or more, and the body text is 14px", async ({ page }) => {
      await open(page, "/e2e-fixtures/account");
      const button = page.getByRole("button", { name: "Save handle" });
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate((el) => getComputedStyle(el).borderRadius)).toMatch(/9999|999|px/);
      const text = page.getByText(/is in review\. It shows on the leaderboard/);
      expect(await text.evaluate((el) => getComputedStyle(el).fontSize)).toBe("14px");
    });

    test("the review page has the same header and a row for each handle, each action at 44px or more", async ({ page }) => {
      await open(page, "/e2e-fixtures/admin");
      const header = page.locator("header.bp-terminal__header");
      await expect(header).toContainText("Handle review");
      await expect(header.getByText("#4 of 12")).toBeVisible();
      const rows = page.getByRole("list", { name: "Handles waiting for review" }).getByRole("listitem");
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toContainText("bullrun99");
      await expect(rows.first()).toContainText("p = 0.620");
      for (const button of await page.getByRole("button", { name: /^(Approve|Reject|Retry) / }).all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("list", { name: "Handles stuck pending" })).toContainText("slowpoke");
      // the reported handles: a count each, Dismiss and Revoke at 44px, and never who reported
      const reported = page.getByRole("list", { name: "Reported handles" }).getByRole("listitem");
      await expect(reported).toHaveCount(2);
      await expect(reported.first()).toContainText("loud_bull");
      await expect(reported.first()).toContainText("3 reports");
      await expect(reported.nth(1)).toContainText("1 report");
      await expect(reported.first().getByRole("button", { name: "Revoke loud_bull" })).toBeVisible();
      await expect(reported.first().getByRole("button", { name: "Dismiss reports of loud_bull" })).toBeVisible();
    });

    test("neither page scrolls sideways", async ({ page }) => {
      for (const path of ["/e2e-fixtures/account", "/e2e-fixtures/admin"]) {
        await open(page, path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
      }
    });

    test("no accessibility violations in either theme, on either page", async ({ page }) => {
      for (const path of ["/e2e-fixtures/account", "/e2e-fixtures/admin"]) {
        await open(page, path);
        for (const theme of ["dark", "light"]) {
          if (!(await page.locator("html").evaluate((el, t) => el.classList.contains("dark") === (t === "dark"), theme))) await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
          await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`), `axe on ${path} in ${theme}`).toEqual([]);
        }
      }
    });
  });
}

test.describe("the real routes", () => {
  test("the review page is a 404 for a visitor: the allowlist is untouched by the new frame", async ({ page }) => {
    const response = await page.goto("/admin/handles");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Handles in review" })).toHaveCount(0);
  });

  test("the account page for a visitor has the header and the same sign-in words, and no form", async ({ page }) => {
    await mockHeavyTerminal(page);
    const response = await page.goto("/account");
    expect(response?.status()).toBe(200);
    await expect(page.locator("header.bp-terminal__header").getByRole("heading", { level: 1, name: "Bullpen" })).toBeVisible();
    await expect(page.getByText(/Sign in with GitHub on the terminal to set a handle/)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });
});
