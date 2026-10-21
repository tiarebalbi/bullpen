import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateSweepTick } from "@bullpen/contracts";

const tickMock = vi.fn();
const authMock = vi.fn();
vi.mock("@bullpen/db-trading", () => ({
  tick: (...args: unknown[]) => tickMock(...args),
  createSimulatedVenue: () => ({}),
}));
vi.mock("../../../lib/trading/pool.js", () => ({ tradingPool: () => ({}) }));
vi.mock("../../../lib/trading/sweepAuth.js", () => ({ authorizeSweep: (...args: unknown[]) => authMock(...args) }));

const { POST, GET } = (await import("./route.js")) as { POST: (r: Request) => Promise<Response>; GET?: unknown };

const reply = { at: "2026-10-20T12:00:00.000Z", open: 3, flagged: 0, fills: 1, cancels: 0, placed: 0, cancelRequested: 0, released: 1, releaseFailed: 0, errors: 0 };
const call = () => POST(new Request("http://x/api/internal/sweep", { method: "POST" }));

describe("POST /api/internal/sweep", () => {
  beforeEach(() => {
    tickMock.mockReset().mockResolvedValue(reply);
    authMock.mockReset().mockReturnValue("ok");
  });

  it("runs a tick when the request is authorised and answers with a body that meets the contract", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(validateSweepTick(await response.json())).toEqual({ valid: true, errors: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(tickMock).toHaveBeenCalledTimes(1);
  });

  it("answers 401 and runs nothing when the request is not authorised", async () => {
    authMock.mockReturnValue("unauthorized");
    expect((await call()).status).toBe(401);
    expect(tickMock).not.toHaveBeenCalled();
  });

  it("answers 503 and runs nothing when the sweep is not configured", async () => {
    authMock.mockReturnValue("not-configured");
    expect((await call()).status).toBe(503);
    expect(tickMock).not.toHaveBeenCalled();
  });

  it("answers 500 without the error text when the tick fails", async () => {
    tickMock.mockRejectedValue(new Error("password authentication failed for user trading_owner"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/password|trading_owner/);
  });

  it("answers no GET: the sweep is not something a page load may trigger", () => {
    expect(GET).toBeUndefined();
  });
});
