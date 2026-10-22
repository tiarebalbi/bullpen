import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authConfigIssues: vi.fn(), tradingChecks: vi.fn() }));
vi.mock("../../lib/auth/health.js", () => ({ authConfigIssues: mocks.authConfigIssues }));
vi.mock("../../lib/trading/health.js", () => ({ tradingChecks: mocks.tradingChecks }));

const { GET } = await import("./route.js");

const passing = [{ name: "trading-config", ok: true, problems: [] }, { name: "trading-database", ok: true, problems: [] }];
type Body = { status: string; checks: { name: string; ok: boolean; problems: string[] }[] };

beforeEach(() => {
  mocks.authConfigIssues.mockReset().mockReturnValue([]);
  mocks.tradingChecks.mockReset().mockResolvedValue(passing);
});

describe("GET /api/health", () => {
  it("answers 200 'ok' with every check passing, and is never cached", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", checks: [...passing, { name: "auth-config", ok: true, problems: [] }] });
  });

  it("answers 503 and carries the problem when a trading check fails", async () => {
    mocks.tradingChecks.mockResolvedValue([passing[0], { name: "trading-database", ok: false, problems: ["trading.accounts.owner_user_id is missing: run the migrations"] }]);
    const response = await GET();
    expect(response.status).toBe(503);
    const body = (await response.json()) as Body;
    expect(body.status).toBe("unhealthy");
    expect(body.checks.find((c) => c.name === "trading-database")).toMatchObject({ ok: false, problems: ["trading.accounts.owner_user_id is missing: run the migrations"] });
    expect(body.checks.filter((c) => c.ok)).toHaveLength(2);
  });

  it("answers 503 when the sign-in variables are not usable", async () => {
    mocks.authConfigIssues.mockReturnValue(["a sign-in variable is not set"]);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(((await response.json()) as Body).checks.find((c) => c.name === "auth-config")).toEqual({ name: "auth-config", ok: false, problems: ["a sign-in variable is not set"] });
  });
});
