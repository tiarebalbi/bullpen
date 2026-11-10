import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

// The fixture routes draw the account and review screens with made-up data, for the e2e specs and the screenshots. Anywhere but the e2e server they are the page a missing route gets.
afterEach(() => vi.unstubAllEnvs());

const { default: AccountFixture } = await import("./account/page.js");
const { default: AdminFixture } = await import("./admin/page.js");
const pages = { account: AccountFixture, admin: AdminFixture };

describe("the e2e fixture routes", () => {
  it.each(["account", "admin"])("/%s is a 404 unless BULLPEN_E2E_FIXTURES is 1", async (name) => {
    const Page = pages[name as keyof typeof pages];
    vi.stubEnv("BULLPEN_E2E_FIXTURES", "");
    expect(() => Page()).toThrow(/NOT_FOUND/);
    vi.stubEnv("BULLPEN_E2E_FIXTURES", "0");
    expect(() => Page()).toThrow(/NOT_FOUND/);
    vi.stubEnv("BULLPEN_E2E_FIXTURES", undefined as unknown as string);
    expect(() => Page()).toThrow(/NOT_FOUND/);
  });

  it.each(["account", "admin"])("/%s renders only when BULLPEN_E2E_FIXTURES is 1", async (name) => {
    const Page = pages[name as keyof typeof pages];
    vi.stubEnv("BULLPEN_E2E_FIXTURES", "1");
    expect(Page()).toBeTruthy();
  });

  it("the fixture queue is made up: no real handle is in it", async () => {
    const { REVIEW_ITEMS, OWN_HANDLE } = await import("../../e2e/polishFixture.js");
    expect(REVIEW_ITEMS.map((item) => item.handle)).toEqual(["bullrun99", "x_trader", "mr_market"]);
    expect(OWN_HANDLE.handle).toBe("bull_run");
  });
});
