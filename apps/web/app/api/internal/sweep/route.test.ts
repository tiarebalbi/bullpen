import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateSweepTick } from "@bullpen/contracts";

const tickMock = vi.fn();
vi.mock("@bullpen/db-trading", () => ({
  tick: (...args: unknown[]) => tickMock(...args),
  DerivedVenue: class {},
  dbPriceSource: () => ({}),
}));
vi.mock("../../../lib/trading/pool.js", () => ({ tradingPool: () => ({}) }));

const { POST, GET } = (await import("./route.js")) as { POST: (r: Request) => Promise<Response>; GET?: unknown };

const reply = { at: "2026-10-20T12:00:00.000Z", open: 3, flagged: 0, fills: 1, cancels: 0, placed: 0, cancelRequested: 0, released: 1, releaseFailed: 0, errors: 0 };
const call = (token?: string) => POST(new Request("http://x/api/internal/sweep", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

describe("POST /api/internal/sweep", () => {
  beforeEach(() => {
    tickMock.mockReset().mockResolvedValue(reply);
    vi.stubEnv("SWEEP_SECRET", "right-secret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("runs a tick for the right token and answers with a body that meets the contract", async () => {
    const response = await call("right-secret");
    expect(response.status).toBe(200);
    expect(validateSweepTick(await response.json())).toEqual({ valid: true, errors: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(tickMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing, wrong or differently-schemed token and runs nothing", async () => {
    for (const token of [undefined, "wrong", "right-secre", "right-secret-and-more"]) expect((await call(token)).status).toBe(401);
    expect((await POST(new Request("http://x", { method: "POST", headers: { authorization: "Basic right-secret" } }))).status).toBe(401);
    expect(tickMock).not.toHaveBeenCalled();
  });

  it("answers 503 and runs nothing when no secret is configured, even for an empty token", async () => {
    vi.stubEnv("SWEEP_SECRET", "");
    expect((await call("")).status).toBe(503);
    expect((await call("anything")).status).toBe(503);
    expect(tickMock).not.toHaveBeenCalled();
  });

  it("answers 500 without the error text when the tick fails", async () => {
    tickMock.mockRejectedValue(new Error("password authentication failed for user trading_owner"));
    const response = await call("right-secret");
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/password|trading_owner/);
  });

  it("answers no GET: the sweep is not something a page load may trigger", () => {
    expect(GET).toBeUndefined();
  });
});
