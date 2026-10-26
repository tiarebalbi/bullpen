import { describe, expect, it } from "vitest";
import type { AccountView, OrderState, OrderView } from "@bullpen/contracts";
import { IDLE_POLL_MS, OPEN_POLL_MS, pollInterval, readAccount } from "./useAccount.js";

const view = (states: OrderState[]): AccountView => ({
  label: "Player 4F2A", buyingPower: "100000.00000000", reserved: "0.00000000", cash: "100000.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], latestOrder: null, fills: [], asOf: "2026-10-20T10:00:00.000Z",
  orders: states.map((state, i) => ({ orderId: `o${i}`, symbol: "AAPL", side: "buy", type: "market", state } as OrderView)),
});
const answer = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe("how often the account is read", () => {
  it("3 s while any order is open, 15 s when none is, and a cancel request counts as open", () => {
    expect(pollInterval(view(["working"]))).toBe(OPEN_POLL_MS);
    expect(pollInterval(view(["filled", "cancel_requested"]))).toBe(OPEN_POLL_MS);
    expect(pollInterval(view(["filled", "cancelled", "rejected"]))).toBe(IDLE_POLL_MS);
    expect(pollInterval(view([]))).toBe(IDLE_POLL_MS);
    expect(pollInterval(null)).toBe(IDLE_POLL_MS);
  });
});

describe("what a read of the account says", () => {
  it("an account, signed out, sign-in off, and a failure are four different answers", async () => {
    expect(await readAccount(answer(200, view([])))).toMatchObject({ status: "ok" });
    expect(await readAccount(answer(401, { error: "sign-in-required", message: "Sign in" }))).toEqual({ status: "signed-out" });
    expect(await readAccount(answer(503, { error: "sign-in-unavailable", message: "Not here" }))).toEqual({ status: "off", message: "Not here" });
    expect(await readAccount(answer(503, { error: "unavailable", message: "Try later" }))).toEqual({ status: "error", message: "Try later" });
    expect(await readAccount((async () => { throw new Error("offline"); }) as typeof fetch)).toMatchObject({ status: "error" });
  });
});
