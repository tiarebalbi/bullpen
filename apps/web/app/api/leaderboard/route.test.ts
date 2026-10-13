import { beforeEach, describe, expect, it, vi } from "vitest";

const serveLeaderboard = vi.fn();
const after = vi.fn();
vi.mock("@bullpen/db-trading", () => ({ serveLeaderboard }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after };
});
vi.mock("../../lib/trading/pool.js", () => ({ tradingPool: () => ({}) }));

const { GET } = await import("./route.js");

const read = (overrides = {}) => ({
  rows: [{ accountId: "a1", handle: "ada", cash: "600.00000000", positionsValue: "400.00000000", equity: "1000.00000000", rank: 1 }],
  asOf: new Date("2026-10-13T20:00:00Z"),
  ageMs: 120_000,
  stale: false,
  lastFailure: null,
  ...overrides,
});

describe("GET /api/leaderboard", () => {
  beforeEach(() => {
    serveLeaderboard.mockReset();
    after.mockReset();
  });

  it("returns the ranking with its as-of time and age, and never caches it", async () => {
    serveLeaderboard.mockResolvedValue(read());
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      rows: [{ accountId: "a1", handle: "ada", cash: "600.00000000", positionsValue: "400.00000000", equity: "1000.00000000", rank: 1 }],
      asOf: "2026-10-13T20:00:00.000Z",
      ageMs: 120_000,
      stale: false,
      lastFailure: null,
    });
  });

  it("hands the refresh to Next's after(), so it starts once the response has been sent", async () => {
    serveLeaderboard.mockImplementation(async (_pool: unknown, { schedule }: { schedule: (work: () => Promise<unknown>) => void }) => {
      schedule(async () => "refreshed");
      return read({ stale: true, ageMs: 400_000 });
    });
    const response = await GET();

    expect(after).toHaveBeenCalledTimes(1);
    expect((await response.json()).stale).toBe(true);
  });

  it("reports the last failed refresh, keeping the ranking it has", async () => {
    serveLeaderboard.mockResolvedValue(read({ stale: true, lastFailure: { at: new Date("2026-10-13T20:05:00Z"), error: "boom" } }));
    const body = await (await GET()).json();
    expect(body.rows).toHaveLength(1);
    expect(body.lastFailure).toEqual({ at: "2026-10-13T20:05:00.000Z", error: "boom" });
  });

  it("answers 503 with a plain message when the database cannot be reached", async () => {
    serveLeaderboard.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Leaderboard unavailable." });
  });
});
