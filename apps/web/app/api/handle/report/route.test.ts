import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signInAvailable: vi.fn(), currentPlayer: vi.fn(), reportHandle: vi.fn() }));
vi.mock("../../../lib/auth/server.js", () => ({ signInAvailable: mocks.signInAvailable }));
vi.mock("../../../lib/auth/player.js", () => ({ currentPlayer: mocks.currentPlayer }));
vi.mock("../../../lib/handles/pool.js", () => ({ handlesPool: () => ({ pool: true }) }));
vi.mock("@bullpen/db-handles", () => ({ reportHandle: mocks.reportHandle }));

const { POST } = await import("./route.js");
const post = (body: unknown) => POST(new Request("http://x/api/handle/report", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.signInAvailable.mockReturnValue(true);
  mocks.currentPlayer.mockResolvedValue({ userId: "reporter-1", label: "Player 4F2A" });
  mocks.reportHandle.mockResolvedValue({ ok: true });
});

describe("reporting a handle", () => {
  it("records the report for a signed-in player: the reporter's id and the name as shown, and nothing else", async () => {
    const response = await post({ handle: "bull_run" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.reportHandle).toHaveBeenCalledWith({ pool: true }, "reporter-1", "bull_run");
  });

  it("keeps nothing the reporter typed: a reason or any other field in the body never reaches the store", async () => {
    await post({ handle: "bull_run", reason: "he was rude to me", note: "x", userId: "someone-else" });
    expect(mocks.reportHandle).toHaveBeenCalledTimes(1);
    expect(mocks.reportHandle.mock.calls[0]).toEqual([{ pool: true }, "reporter-1", "bull_run"]);
  });

  it("answers a visitor with 401, and sign-in being unavailable with 503, and records nothing", async () => {
    mocks.currentPlayer.mockResolvedValue(null);
    expect((await post({ handle: "bull_run" })).status).toBe(401);
    mocks.signInAvailable.mockReturnValue(false);
    expect((await post({ handle: "bull_run" })).status).toBe(503);
    expect(mocks.reportHandle).not.toHaveBeenCalled();
  });

  it("refuses a body that is not a handle, with a 400", async () => {
    for (const body of ["not json", null, {}, { handle: "no spaces" }, { handle: "ab" }, { handle: 5 }, { handle: "Player 4F2A" }]) expect((await post(body)).status).toBe(400);
    expect(mocks.reportHandle).not.toHaveBeenCalled();
  });

  it("says in words when it is your own handle, when you already reported it, and when it is not shown", async () => {
    mocks.reportHandle.mockResolvedValueOnce({ ok: false, reason: "own" });
    const own = await post({ handle: "bull_run" });
    expect(own.status).toBe(409);
    expect(await own.json()).toMatchObject({ error: "own-handle", message: "That is your own handle." });
    mocks.reportHandle.mockResolvedValueOnce({ ok: false, reason: "already" });
    const again = await post({ handle: "bull_run" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "already-reported", message: "You have already reported that handle." });
    mocks.reportHandle.mockResolvedValueOnce({ ok: false, reason: "not-found" });
    const gone = await post({ handle: "bull_run" });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toMatchObject({ error: "not-found" });
  });

  it("answers 503 in words when the store fails, and logs no handle and no user", async () => {
    mocks.reportHandle.mockRejectedValue(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }));
    const response = await post({ handle: "bull_run" });
    expect(response.status).toBe(503);
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls);
    expect(logged).not.toContain("bull_run");
    expect(logged).not.toContain("reporter-1");
  });
});
