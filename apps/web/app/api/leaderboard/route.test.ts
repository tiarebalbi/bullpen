import { beforeEach, describe, expect, it, vi } from "vitest";

const serve = vi.fn();
vi.mock("@bullpen/db-trading", () => ({ serveLeaderboard: (...args: unknown[]) => serve(...args) }));
vi.mock("../../lib/trading/pool.js", () => ({ tradingPool: () => ({}) }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (work: () => unknown) => void work }));

const { GET } = await import("./route.js");

const read = { rows: [{ accountId: "a", handle: "ada", cash: "1", positionsValue: "0", equity: "1", rank: 1 }], total: 812, asOf: new Date("2026-10-16T12:00:00Z"), ageMs: 1000, stale: false, lastFailure: null };
const UUID = "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11";

describe("GET /api/leaderboard", () => {
  beforeEach(() => {
    // Braces: a function returned from beforeEach is run as its cleanup, and the mock would be called again.
    serve.mockReset().mockResolvedValue(read);
  });

  it("returns what the read gives, with the number of ranked accounts, and caches nothing", async () => {
    const response = await GET(new Request("http://x/api/leaderboard"));
    const body = await response.json();
    expect(body).toMatchObject({ total: 812, stale: false, asOf: "2026-10-16T12:00:00.000Z" });
    expect(body.rows).toHaveLength(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("asks for no more than the cap: it passes no limit above the one the read enforces", async () => {
    await GET(new Request("http://x/api/leaderboard"));
    expect(serve.mock.calls[0]![1].read).toEqual({ accountId: undefined });
  });

  it("passes the caller's account to the read when it is a uuid, and ignores anything else", async () => {
    await GET(new Request(`http://x/api/leaderboard?account=${UUID}`));
    expect(serve.mock.calls[0]![1].read).toEqual({ accountId: UUID });
    await GET(new Request("http://x/api/leaderboard?account=1%3B%20DROP%20TABLE%20x"));
    expect(serve.mock.calls[1]![1].read).toEqual({ accountId: undefined });
  });

  it("answers 503 when the database is unavailable, without the error text", async () => {
    serve.mockImplementation(async () => {
      throw new Error("password authentication failed for user x");
    });
    const response = await GET(new Request("http://x/api/leaderboard"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("password");
  });
});
