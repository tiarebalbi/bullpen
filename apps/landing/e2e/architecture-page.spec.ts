import { expect, test, type Page } from "@playwright/test";

// /architecture: six tabs, one moment scrubber shared by all of them, a deep
// link per tab (/architecture#services), and no sample text from the design.

const TABS = [
  { id: "overview", name: "Overview" },
  { id: "services", name: "Services" },
  { id: "flows", name: "Flows" },
  { id: "data", name: "Data" },
  { id: "decisions", name: "Decisions" },
  { id: "rules", name: "Rules" },
] as const;

// What each tab's panel opens with at Part 1, from the repo's own records.
const OPENING: Record<(typeof TABS)[number]["id"], string> = {
  overview: "Why distribute at all",
  services: "Three services run today",
  flows: "Follow a price request",
  data: "Data ownership arrives in Part 3",
  decisions: "Written down, then built",
  rules: "Checked, not hoped for",
};

// Checked against the rendered page (markup and text). Next also serializes every
// ADR into a script payload for the client, and ADR-0008 really does list a
// rejected provider under Alternatives, so scripts are left out of this list...
const SAMPLE_TEXT = ["214 players", "NVDA", "Buy 10", "Alpaca", "Stripe", "Massive", "Order #", "IEX", "Rust on AWS Lambda"];

// ...while the design's own two sample strings must be absent everywhere, payload included.
const STRICT_SAMPLE_TEXT = ["214 players", "NVDA"];

const withoutScripts = (html: string): string => html.replace(/<script[\s\S]*?<\/script>/g, "");

const priceMock = {
  symbol: "BTC-USD",
  price: 65432.1,
  changePercent: 2.34,
  time: new Date().toISOString(),
  source: "coingecko",
  fetchedAt: new Date().toISOString(),
};

const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const panel = (page: Page) => page.getByRole("tabpanel");
const scrubber = (page: Page) => page.getByRole("group", { name: "Series part" });
const toPart = (page: Page, n: number) => scrubber(page).getByRole("button", { name: `PART ${n}` }).click();

for (const viewport of [
  { label: "1440px", width: 1440, height: 1000 },
  { label: "390px", width: 390, height: 844 },
]) {
  test.describe(`Architecture page at ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const t of TABS) {
      test(`${t.name} renders, and /architecture#${t.id} deep-links to it`, async ({ page }) => {
        await page.goto(`/architecture#${t.id}`);
        await expect(tab(page, t.name)).toHaveAttribute("aria-selected", "true");
        await expect(panel(page)).toContainText(OPENING[t.id]);
      });
    }

    test("clicking a tab opens it and puts it in the URL", async ({ page }) => {
      await page.goto("/architecture");
      await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true");

      for (const t of TABS.slice(1)) {
        await tab(page, t.name).click();
        await expect(page).toHaveURL(new RegExp(`/architecture#${t.id}$`));
        await expect(tab(page, t.name)).toHaveAttribute("aria-selected", "true");
        await expect(panel(page)).toContainText(OPENING[t.id]);
      }
    });

    test("no tab scrolls the page sideways", async ({ page }) => {
      for (const t of TABS) {
        await page.goto(`/architecture#${t.id}`);
        await expect(tab(page, t.name)).toHaveAttribute("aria-selected", "true");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `#${t.id} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
    });

    test("the Data tab shows the empty state at Part 1 and Part 2, never invented data", async ({ page }) => {
      await page.goto("/architecture#data");
      await expect(panel(page).getByText("Not reached at Part 1")).toBeVisible();
      await expect(panel(page).getByRole("heading", { name: "Data ownership arrives in Part 3" })).toBeVisible();
      await expect(panel(page).getByRole("button", { name: "Jump to Part 3" })).toBeVisible();

      await toPart(page, 2);
      await expect(panel(page).getByText("Not reached at Part 2")).toBeVisible();
      await expect(panel(page).getByRole("heading", { name: "Data ownership arrives in Part 3" })).toBeVisible();
    });

    test("Jump to Part 3 moves the scrubber and the Data tab shows the planned databases", async ({ page }) => {
      await page.goto("/architecture#data");
      await panel(page).getByRole("button", { name: "Jump to Part 3" }).click();

      await expect(scrubber(page).getByRole("button", { name: "PART 3" })).toHaveAttribute("aria-current", "step");
      await expect(panel(page).getByRole("heading", { name: "One owner per database" })).toBeVisible();
      await expect(panel(page).getByRole("heading", { name: "Prices Database" })).toBeVisible();
      await expect(panel(page).getByText("Not reached")).toHaveCount(0);
    });
  });
}

test.describe("Architecture page, desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("the scrubber changes every tab", async ({ page }) => {
    await page.goto("/architecture#overview");
    await expect(panel(page)).toContainText("Overview · Part 1");

    // Overview
    await toPart(page, 3);
    await expect(panel(page)).toContainText("Overview · Part 3");
    await expect(panel(page).getByText("Planned", { exact: true }).first()).toBeVisible();

    // Services: the planned services appear beside what runs today
    await tab(page, "Services").click();
    await expect(panel(page).getByRole("heading", { name: "Planned for Part 3" })).toBeVisible();
    await expect(panel(page).getByRole("heading", { name: "Prices Service" })).toBeVisible();

    // Flows: the same request, marked as a prediction
    await tab(page, "Flows").click();
    await expect(panel(page).getByText("Preview · planned")).toBeVisible();

    // Data: reached from Part 3
    await tab(page, "Data").click();
    await expect(panel(page).getByRole("heading", { name: "One owner per database" })).toBeVisible();

    // Decisions: Part 3's ADR is in the list now
    await tab(page, "Decisions").click();
    await expect(panel(page).locator(".bp-decisions-row", { hasText: "ADR-0008" })).toHaveCount(1);

    // Rules: every rule is in force
    await tab(page, "Rules").click();
    await expect(panel(page)).toContainText("Rules · Part 3");
    await expect(panel(page).getByText(/Arrives in Part/)).toHaveCount(0);

    // And back to Part 1, where each of those is different again.
    await toPart(page, 1);
    await expect(panel(page)).toContainText("Rules · Part 1");
    await expect(panel(page).getByText(/Arrives in Part 2/).first()).toBeVisible();
    await tab(page, "Decisions").click();
    await expect(panel(page).locator(".bp-decisions-row", { hasText: "ADR-0008" })).toHaveCount(0);
    await expect(panel(page).locator(".bp-decisions-row", { hasText: "ADR-0009" })).toHaveCount(0);
    await tab(page, "Services").click();
    await expect(panel(page).getByRole("heading", { name: "Planned for Part 3" })).toHaveCount(0);
  });

  test("Services: no rule is checked at Part 1, and Part 2 shows the snapshot's real results", async ({ page }) => {
    await page.goto("/architecture#services");
    await expect(panel(page).getByText("No rule is checked against it at Part 1.")).toHaveCount(3);

    await toPart(page, 2);
    await expect(panel(page).getByText("No rule is checked against it at Part")).toHaveCount(0);
    await expect(panel(page).getByText("Apps never depend on other apps").first()).toBeVisible();
    await expect(panel(page).getByText("The API key is read in one place")).toHaveCount(1);
    // Each rule carries a result from the snapshot, never a blank or invented pass.
    await expect(panel(page).locator(".bp-ap-rules .bp-chip").first()).toContainText(/pass|fail|no result/);
    await expect(panel(page).getByText("Cost: estimate arrives in Part 5")).toHaveCount(3);
  });

  test("Services: only what exists at Part 1 and 2, with what each owns and its interfaces", async ({ page }) => {
    await page.goto("/architecture#services");
    for (const name of ["Bullpen Landing", "Bullpen Trading App", "Price Snapshot Service"]) {
      await expect(panel(page).getByRole("heading", { name })).toBeVisible();
    }
    const route = panel(page).locator("article", { has: page.getByRole("heading", { name: "Price Snapshot Service" }) });
    await expect(route).toContainText("The code in apps/web/app/api/price");
    await expect(route).toContainText("The only code that reads");
    await expect(route).toContainText("CoinGecko");
    await expect(route).toContainText("Serverless");
  });

  test("Services: 'See it in the overview' opens the Overview with that service selected", async ({ page }) => {
    await page.goto("/architecture#services");
    await panel(page).getByRole("button", { name: "See it in the overview" }).first().click();

    await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true");
    const details = panel(page).getByRole("complementary", { name: "Details" });
    await expect(details).toContainText("Bullpen Landing");
    await expect(details).toContainText("ADR-0003");
  });

  test("Flows: one real price request, player to trading app to price route to CoinGecko, cached 300 s", async ({ page }) => {
    await page.goto("/architecture#flows");
    await toPart(page, 2);

    const lanes = panel(page).locator(".bp-ap-seq__lane");
    await expect(lanes).toHaveText([/Player/, /Bullpen Trading App/, /Price Snapshot Service/, /CoinGecko/]);
    const steps = panel(page).getByRole("list", { name: "Steps" }).getByRole("listitem");
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(2)).toContainText("cached for 300 seconds");
    await expect(panel(page).getByText("Preview · planned")).toHaveCount(0);
  });

  test("Flows: playback steps forward and back", async ({ page }) => {
    await page.goto("/architecture#flows");
    const playback = panel(page).getByRole("group", { name: "Playback" });
    await expect(playback).toContainText("STEP 1 OF 4");

    await playback.getByRole("button", { name: "Next step" }).click();
    await expect(playback).toContainText("STEP 2 OF 4");
    await expect(panel(page).getByRole("button", { name: /Ask for a quote/ })).toHaveAttribute("aria-current", "step");

    await playback.getByRole("button", { name: "Previous step" }).click();
    await expect(playback).toContainText("STEP 1 OF 4");
  });

  test("Rules: every rule with the snapshot's result, and the commit it ran for", async ({ page }) => {
    await page.goto("/architecture#rules");
    await toPart(page, 2);

    await expect(panel(page)).toContainText(/Snapshot for Part \d, commit [0-9a-f]{7}/);
    await expect(panel(page).locator(".bp-rule-card")).toHaveCount(4);
    const row = panel(page).locator("tr", { hasText: "libraries NEVER DEPEND ON apps" });
    await expect(row).toContainText(/pass|fail/);
    await expect(row).not.toContainText("Arrives in Part");
    await expect(panel(page).getByRole("cell", { name: "check:arch", exact: true })).toBeVisible();
    await expect(panel(page).getByRole("cell", { name: "calm validate (part-02)" })).toBeVisible();
  });

  test("Decisions: an ADR opens in the modal, and closing it leaves you on the Decisions tab", async ({ page }) => {
    await page.goto("/architecture#decisions");
    await panel(page).locator(".bp-decisions-row", { hasText: "ADR-0002" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("ADR-0002", { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/architecture#decisions$/);
    await expect(tab(page, "Decisions")).toHaveAttribute("aria-selected", "true");
  });

  test("an ADR link in the Overview's side panel opens that decision in the Decisions tab", async ({ page }) => {
    await page.goto("/architecture#overview");
    await page.getByRole("button", { name: "Bullpen Trading App, App" }).click();
    await panel(page).getByRole("complementary", { name: "Details" }).getByRole("link", { name: /ADR-0001/ }).click();

    await expect(tab(page, "Decisions")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("ADR-0001", { exact: true })).toBeVisible();
  });

  test("the arrow keys move between tabs", async ({ page }) => {
    await page.goto("/architecture");
    await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true");
    await tab(page, "Overview").focus();

    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "Services")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(tab(page, "Overview")).toHaveAttribute("aria-selected", "true");
  });

  test("the scrubber's arrow keys and Play move through the parts", async ({ page }) => {
    await page.goto("/architecture#services");
    await scrubber(page).getByRole("button", { name: "PART 1" }).focus();

    await page.keyboard.press("ArrowRight");
    await expect(scrubber(page).getByRole("button", { name: "PART 2" })).toHaveAttribute("aria-current", "step");

    await page.getByRole("button", { name: "Play the series" }).click();
    await expect(page.getByRole("button", { name: "Pause the series" })).toBeVisible();
    await expect(scrubber(page).getByRole("button", { name: "PART 3" })).toHaveAttribute("aria-current", "step", { timeout: 6000 });
    await page.getByRole("button", { name: "Pause the series" }).click();
    await expect(page.getByRole("button", { name: "Play the series" })).toBeVisible();
  });

  test("the nav marks Architecture as the current page and links back to the home sections", async ({ page }) => {
    await page.goto("/architecture");
    const nav = page.getByRole("navigation", { name: "Page sections" });
    await expect(nav.getByRole("link", { name: "Architecture" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Decisions" })).toHaveAttribute("href", "/#decisions");
  });

  test("the home page's Architecture section links to the page", async ({ page }) => {
    await page.route("**/api/price/BTC-USD", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(priceMock) }));
    await page.goto("/");
    await page.locator("#architecture").getByRole("link", { name: "Open the full architecture page" }).click();
    await expect(page).toHaveURL(/\/architecture$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The system, part by part");
  });
});

test.describe("Architecture page, metadata and content", () => {
  test("has its own title, description and canonical, and exactly one h1", async ({ request, page }) => {
    const res = await request.get("/architecture", { headers: { Host: "bullpen.tiarebalbi.com" } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>Bullpen architecture: services, flows, decisions and rules</title>");
    expect(html).toContain('<link rel="canonical" href="https://bullpen.tiarebalbi.com/architecture"');
    expect(html).toMatch(/<meta name="description" content="How Bullpen is built, part by part/);

    await page.goto("/architecture");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("every tab has an h2, and every h3 sits under one", async ({ page }) => {
    for (const t of TABS) {
      await page.goto(`/architecture#${t.id}`);
      await expect(tab(page, t.name)).toHaveAttribute("aria-selected", "true");
      await expect(panel(page).locator("h2")).toHaveCount(1);
      const outline = await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => h.tagName));
      const firstH3 = outline.indexOf("H3");
      if (firstH3 !== -1) expect(outline.slice(0, firstH3)).toContain("H2");
    }
  });

  test("no sample text from the design appears on any tab, at the first part or the last", async ({ page, request }) => {
    const initial = await (await request.get("/architecture")).text();
    for (const sample of STRICT_SAMPLE_TEXT) expect(initial, `"${sample}" in the page HTML`).not.toContain(sample);
    for (const sample of SAMPLE_TEXT) expect(withoutScripts(initial), `"${sample}" in the page markup`).not.toContain(sample);

    await page.goto("/architecture#overview");
    for (const part of [1, 6]) {
      await toPart(page, part);
      for (const t of TABS) {
        await tab(page, t.name).click();
        await expect(tab(page, t.name)).toHaveAttribute("aria-selected", "true");
        const text = await page.locator("body").innerText();
        const html = await page.content();
        for (const sample of STRICT_SAMPLE_TEXT) expect(html, `"${sample}" in the HTML of #${t.id} at Part ${part}`).not.toContain(sample);
        for (const sample of SAMPLE_TEXT) {
          expect(text, `"${sample}" on #${t.id} at Part ${part}`).not.toContain(sample);
          expect(withoutScripts(html), `"${sample}" in the markup of #${t.id} at Part ${part}`).not.toContain(sample);
        }
      }
    }
  });

  test("copy is first person singular and names no one outside the byline", async ({ page }) => {
    await page.goto("/architecture#services");
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\bwe\b/i);
    expect(text).not.toMatch(/\bour\b/i);
    expect(text).not.toContain("Tiarê Balbi");
    expect(text).not.toContain("Tiare Balbi");
  });
});
