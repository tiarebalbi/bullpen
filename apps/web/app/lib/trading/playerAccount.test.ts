import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { Player } from "../auth/player.js";

vi.mock("@bullpen/db-trading", () => ({ ensurePlayerAccount: vi.fn() }));
vi.mock("./pool.js", () => ({ tradingPool: () => ({}) }));
vi.mock("../auth/server.js", () => ({ signInAvailable: () => true }));
vi.mock("../auth/player.js", () => ({ currentPlayer: async () => null }));

const { logFailure, resolvePlayer } = await import("./playerAccount.js");

const player: Player = { userId: "user-secret-id", label: "Player 4F2A" };
const deps = (ensureAccount: (userId: string) => Promise<{ accountId: string }>) => ({ signInAvailable: () => true, currentPlayer: async () => player, ensureAccount });

let errorLog: MockInstance<typeof console.error>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => errorLog.mockRestore());

const logged = (): Record<string, unknown> => JSON.parse(String(errorLog.mock.calls[0]![0])) as Record<string, unknown>;

describe("logFailure", () => {
  it("writes one JSON line with where it failed, the error's name, its code and its message", () => {
    logFailure("orders.POST", Object.assign(new Error('column "owner_user_id" does not exist'), { code: "42703" }));
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(logged()).toEqual({ at: "orders.POST", name: "Error", code: "42703", message: 'column "owner_user_id" does not exist' });
  });

  it("leaves the code out when the error has none, and accepts a thrown non-Error", () => {
    logFailure("orders.GET", "boom");
    expect(logged()).toEqual({ at: "orders.GET", name: "Error", message: "boom" });
  });

  it("cuts a very long message, so one failure cannot flood the log", () => {
    logFailure("orders.GET", new Error("x".repeat(5000)));
    expect(String(logged().message).length).toBeLessThanOrEqual(300);
  });
});

describe("resolvePlayer when the account cannot be made", () => {
  it("answers 503 'unavailable', logs why, and does not put the user's id in the log or the answer", async () => {
    const response = await resolvePlayer(deps(async () => { throw Object.assign(new Error('relation "trading.accounts" does not exist'), { code: "42P01" }); }));
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.response.status).toBe(503);
    expect(await response.response.json()).toMatchObject({ error: "unavailable" });
    expect(logged()).toMatchObject({ at: "resolvePlayer", code: "42P01" });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(player.userId);
  });

  it("logs nothing when the account is found", async () => {
    const response = await resolvePlayer(deps(async () => ({ accountId: "acc-1" })));
    expect(response).toMatchObject({ ok: true, accountId: "acc-1" });
    expect(errorLog).not.toHaveBeenCalled();
  });
});
