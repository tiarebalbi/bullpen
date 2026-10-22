import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { validateAccountView, type AccountView } from "@bullpen/contracts";

const mocks = vi.hoisted(() => ({
  signInAvailable: vi.fn(),
  currentPlayer: vi.fn(),
  ensurePlayerAccount: vi.fn(),
  advanceAccount: vi.fn(),
  placePlayerOrder: vi.fn(),
  readAccountView: vi.fn(),
  cancelPlayerOrder: vi.fn(),
}));
vi.mock("../../lib/auth/server.js", () => ({ signInAvailable: mocks.signInAvailable }));
vi.mock("../../lib/auth/player.js", () => ({ currentPlayer: mocks.currentPlayer }));
vi.mock("../../lib/trading/pool.js", () => ({ tradingPool: () => ({}) }));
vi.mock("@bullpen/db-trading", async (importOriginal) => ({ ...(await importOriginal<typeof import("@bullpen/db-trading")>()), ensurePlayerAccount: mocks.ensurePlayerAccount, advanceAccount: mocks.advanceAccount, placePlayerOrder: mocks.placePlayerOrder, readAccountView: mocks.readAccountView, cancelPlayerOrder: mocks.cancelPlayerOrder }));

const { GET, POST } = await import("./route.js");
const { POST: CANCEL } = await import("./[id]/cancel/route.js");
const { BuyRefused } = await import("@bullpen/db-trading");

const KEY = "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11";
const view: AccountView = { label: "Player 4F2A", buyingPower: "100000.00000000", reserved: "0.00000000", cash: "100000.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], orders: [], latestOrder: null, fills: [], asOf: "2026-10-21T12:00:00.000Z" };
const post = (body: unknown) => POST(new Request("http://x/api/orders", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const cancel = (id: string) => CANCEL(new Request(`http://x/api/orders/${id}/cancel`, { method: "POST" }), { params: Promise.resolve({ id }) });

let errorLog: MockInstance<typeof console.error>;
const loggedAt = (): unknown[] => errorLog.mock.calls.map((call) => (JSON.parse(String(call[0])) as { at: string }).at);

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.signInAvailable.mockReturnValue(true);
  mocks.currentPlayer.mockResolvedValue({ userId: "user-1", label: "Player 4F2A" });
  mocks.ensurePlayerAccount.mockResolvedValue({ accountId: "acc-1", handle: "Player 4F2A", created: false });
  mocks.advanceAccount.mockResolvedValue({ placed: 0, fills: 0, cancels: 0, released: 0, errors: 0 });
  mocks.readAccountView.mockResolvedValue(view);
  mocks.placePlayerOrder.mockResolvedValue({ orderId: KEY, duplicate: false });
  mocks.cancelPlayerOrder.mockResolvedValue("requested");
});

describe("who may call", () => {
  it("a signed-out visitor gets 401 that says to sign in, and nothing is read or placed", async () => {
    mocks.currentPlayer.mockResolvedValue(null);
    for (const response of [await GET(), await post({ symbol: "AAPL", quantity: "1", clientOrderId: KEY }), await cancel(KEY)]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "sign-in-required" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.placePlayerOrder).not.toHaveBeenCalled();
    expect(mocks.readAccountView).not.toHaveBeenCalled();
    expect(mocks.cancelPlayerOrder).not.toHaveBeenCalled();
  });

  it("where sign-in is not available (a preview) the answer is 503 and says so, whatever cookie is sent", async () => {
    mocks.signInAvailable.mockReturnValue(false);
    const response = await post({ symbol: "AAPL", quantity: "1", clientOrderId: KEY });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "sign-in-unavailable" });
    expect(mocks.currentPlayer).not.toHaveBeenCalled();
  });
});

describe("GET /api/orders", () => {
  it("moves the player's own orders along, then answers with the account, which meets the contract", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.advanceAccount.mock.calls[0]![1]).toBe("acc-1");
    expect(validateAccountView(await response.json())).toEqual({ valid: true, errors: null });
  });

  it("answers 503 with no detail when the database cannot be read", async () => {
    mocks.readAccountView.mockRejectedValue(new Error("password authentication failed for user trading_owner"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/password|trading_owner/);
    expect(loggedAt()).toEqual(["orders.GET"]);
  });

  it("answers 503 and logs why when the account itself cannot be made", async () => {
    mocks.ensurePlayerAccount.mockRejectedValue(Object.assign(new Error('column "owner_user_id" does not exist'), { code: "42703" }));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(loggedAt()).toEqual(["resolvePlayer"]);
    expect(mocks.advanceAccount).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders", () => {
  it("places a market buy for the player's own account with the client's key, and answers 201 with the account", async () => {
    const response = await post({ symbol: "AAPL", quantity: "10", clientOrderId: KEY });
    expect(response.status).toBe(201);
    expect(mocks.placePlayerOrder).toHaveBeenCalledWith({}, "acc-1", { symbol: "AAPL", quantity: "10", clientOrderId: KEY });
    const body = await response.json();
    expect(body).toMatchObject({ orderId: KEY, duplicate: false });
    expect(validateAccountView(body.account).valid).toBe(true);
  });

  it("answers 200 for a retry of the same key: the same order, not a second one", async () => {
    mocks.placePlayerOrder.mockResolvedValue({ orderId: KEY, duplicate: true });
    const response = await post({ symbol: "AAPL", quantity: "10", clientOrderId: KEY });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ duplicate: true });
  });

  it("takes the account from the session, never from the body: an account id in the body is refused", async () => {
    const response = await post({ symbol: "AAPL", quantity: "10", clientOrderId: KEY, accountId: "acc-2" });
    expect(response.status).toBe(400);
    expect(mocks.placePlayerOrder).not.toHaveBeenCalled();
  });

  it("refuses with 400 a sell, a limit price, a zero quantity, broken JSON and an empty body, each with words a player can read", async () => {
    for (const body of [{ symbol: "AAPL", quantity: "10", clientOrderId: KEY, side: "sell" }, { symbol: "AAPL", quantity: "10", clientOrderId: KEY, limitPrice: "1" }, { symbol: "AAPL", quantity: "0", clientOrderId: KEY }, "{not json", ""]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect((await response.json()).message).toMatch(/not valid/);
    }
    expect(mocks.placePlayerOrder).not.toHaveBeenCalled();
  });

  it("answers 422 with the lifecycle's own reason when the order is refused: nothing is reserved", async () => {
    mocks.placePlayerOrder.mockRejectedValue(new BuyRefused("insufficient-buying-power", "Refused: not enough buying power for 10 AAPL."));
    const response = await post({ symbol: "AAPL", quantity: "10", clientOrderId: KEY });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "refused", reason: "insufficient-buying-power", message: "Refused: not enough buying power for 10 AAPL." });
  });

  it("answers 503 without the error text when something else fails", async () => {
    mocks.placePlayerOrder.mockRejectedValue(new Error("connection terminated with password=secret"));
    const response = await post({ symbol: "AAPL", quantity: "10", clientOrderId: KEY });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/password|secret/);
    expect(loggedAt()).toEqual(["orders.POST"]);
  });

  it("does not log a refusal: it is an answer, not a failure", async () => {
    mocks.placePlayerOrder.mockRejectedValue(new BuyRefused("insufficient-buying-power", "Refused: not enough buying power for 10 AAPL."));
    await post({ symbol: "AAPL", quantity: "10", clientOrderId: KEY });
    expect(errorLog).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders/[id]/cancel", () => {
  it("answers 503 without the error text, and logs why, when the cancel cannot be asked for", async () => {
    mocks.cancelPlayerOrder.mockRejectedValue(new Error("connection terminated with password=secret"));
    const response = await cancel(KEY);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/password|secret/);
    expect(loggedAt()).toEqual(["orders.cancel"]);
  });

  it("answers 202 'requested': a request, not a cancel", async () => {
    const response = await cancel(KEY);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ outcome: "requested" });
    expect(mocks.cancelPlayerOrder).toHaveBeenCalledWith({}, "acc-1", KEY);
  });

  it("answers 404 for an order that is not the player's and for an id that is not a uuid, in the same words", async () => {
    mocks.cancelPlayerOrder.mockResolvedValue("not-found");
    const theirs = await cancel(KEY);
    const nonsense = await cancel("1; DROP TABLE orders");
    expect([theirs.status, nonsense.status]).toEqual([404, 404]);
    expect((await theirs.json()).message).toBe((await nonsense.json()).message);
  });

  it("passes on 'already' and 'too-late' as they are", async () => {
    for (const outcome of ["already", "too-late"]) {
      mocks.cancelPlayerOrder.mockResolvedValue(outcome);
      expect(await (await cancel(KEY)).json()).toEqual({ outcome });
    }
  });
});
