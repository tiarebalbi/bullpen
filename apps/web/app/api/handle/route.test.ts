import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const mocks = vi.hoisted(() => ({
  signInAvailable: vi.fn(),
  currentPlayer: vi.fn(),
  submitHandle: vi.fn(),
  recordDecision: vi.fn(),
  readOwnHandle: vi.fn(),
  askGateway: vi.fn(),
}));
vi.mock("../../lib/auth/server.js", () => ({ signInAvailable: mocks.signInAvailable }));
vi.mock("../../lib/auth/player.js", () => ({ currentPlayer: mocks.currentPlayer }));
vi.mock("../../lib/handles/pool.js", () => ({ handlesPool: () => ({}) }));
vi.mock("@bullpen/db-handles", () => ({ CHANGE_LIMIT: 5, CHANGE_WINDOW_HOURS: 24, submitHandle: mocks.submitHandle, recordDecision: mocks.recordDecision, readOwnHandle: mocks.readOwnHandle }));
vi.mock("../../lib/moderation/gateway.js", () => ({ askGateway: mocks.askGateway }));

const { GET, POST } = await import("./route.js");
const post = (body: unknown) => POST(new Request("http://x/api/handle", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

let errorLog: MockInstance<typeof console.error>;
let infoLog: MockInstance<typeof console.info>;

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.signInAvailable.mockReturnValue(true);
  mocks.currentPlayer.mockResolvedValue({ userId: "user-1", label: "Player 4F2A" });
  mocks.submitHandle.mockResolvedValue({ ok: true, handleId: "h-1" });
  mocks.recordDecision.mockResolvedValue(true);
  mocks.readOwnHandle.mockResolvedValue(null);
  mocks.askGateway.mockResolvedValue({ ok: true, probability: 0.99, costUsd: 0, latencyMs: 10 });
});

describe("who may call", () => {
  it("a signed-out visitor gets 401, and nothing is saved or asked", async () => {
    mocks.currentPlayer.mockResolvedValue(null);
    for (const response of [await GET(), await post({ handle: "BullRun" })]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.submitHandle).not.toHaveBeenCalled();
    expect(mocks.askGateway).not.toHaveBeenCalled();
  });

  it("says sign-in is unavailable where it is", async () => {
    mocks.signInAvailable.mockReturnValue(false);
    expect((await post({ handle: "BullRun" })).status).toBe(503);
  });
});

describe("POST: saving a handle", () => {
  it("a rule that fails is a 400 form error, and no model is asked", async () => {
    const response = await post({ handle: "no good!" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid-handle", message: expect.stringContaining("letters") });
    expect(mocks.askGateway).not.toHaveBeenCalled();
    expect(mocks.submitHandle).not.toHaveBeenCalled();
  });

  it("an unreadable body is a 400 too", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("a taken name is a 409, and no model is asked", async () => {
    mocks.submitHandle.mockResolvedValue({ ok: false, reason: "taken" });
    const response = await post({ handle: "BullRun" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "handle-taken" });
    expect(mocks.askGateway).not.toHaveBeenCalled();
  });

  it("an approved answer is saved as approved, and the request carried only the handle text to the model", async () => {
    const response = await post({ handle: "BullRun" });
    expect(await response.json()).toEqual({ status: "approved" });
    expect(mocks.askGateway).toHaveBeenCalledExactlyOnceWith("BullRun");
    expect(mocks.recordDecision).toHaveBeenCalledWith({}, expect.objectContaining({ handleId: "h-1", handle: "BullRun", outcome: "approved", probability: 0.99 }));
  });

  it("an unsure answer, a failure and a tie all end in review, never approved", async () => {
    for (const answer of [{ ok: true, probability: 0.5, costUsd: 0, latencyMs: 1 }, { ok: true, probability: 0.9, costUsd: 0, latencyMs: 1 }, { ok: false, reason: "timeout", latencyMs: 2000 }, { ok: false, reason: "no-key", latencyMs: 0 }]) {
      mocks.askGateway.mockResolvedValue(answer);
      expect(await (await post({ handle: "BullRun" })).json()).toEqual({ status: "review" });
    }
  });

  it("answers 200 and 'pending' when the decision cannot be recorded, so moderation failing never fails the player", async () => {
    mocks.recordDecision.mockRejectedValue(new Error("db down"));
    const response = await post({ handle: "BullRun" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending" });
  });

  it("a database that cannot be reached is a 503 that names no detail, and logs neither the handle nor the player", async () => {
    mocks.submitHandle.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const response = await post({ handle: "BullRun" });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/ECONNREFUSED/);
    const logged = errorLog.mock.calls.map((call) => String(call[0])).join("");
    expect(logged).toContain("handle.POST");
    expect(logged).not.toMatch(/BullRun|user-1/);
  });

  it("logs the handle id, status, probability and latency, and not the text", async () => {
    await post({ handle: "BullRun" });
    const line = String(infoLog.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({ at: "moderation", handleId: "h-1", status: "approved", probability: 0.99, latencyMs: 10 });
    expect(line).not.toMatch(/BullRun|user-1/);
  });
});

describe("POST: the limit on changes", () => {
  it("answers 429 with a plain message and a Retry-After, and asks no model", async () => {
    mocks.submitHandle.mockResolvedValue({ ok: false, reason: "limit", retryAfterSeconds: 7300 });
    const response = await post({ handle: "BullRun" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7300");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("handle-limit");
    expect(body.message).toBe("You have changed your handle 5 times in the last 24 hours, which is as many as I allow. Try again in about 3 hours.");
    expect(mocks.askGateway).not.toHaveBeenCalled();
    expect(mocks.recordDecision).not.toHaveBeenCalled();
  });

  it("is checked after the rules and before the model: a bad handle is still a 400, an allowed one reaches the model", async () => {
    mocks.submitHandle.mockResolvedValue({ ok: false, reason: "limit", retryAfterSeconds: 60 });
    expect((await post({ handle: "no good!" })).status).toBe(400);
    mocks.submitHandle.mockResolvedValue({ ok: true, handleId: "h-1" });
    expect((await post({ handle: "BullRun" })).status).toBe(200);
    expect(mocks.askGateway).toHaveBeenCalledOnce();
  });
});

describe("GET: the player's own handle", () => {
  it("returns the player's own handle and status, and the neutral label", async () => {
    mocks.readOwnHandle.mockResolvedValue({ handleId: "h-1", handle: "BullRun", status: "review" });
    expect(await (await GET()).json()).toEqual({ label: "Player 4F2A", handle: { handle: "BullRun", status: "review" } });
  });

  it("returns null when there is none, and 503 when the database cannot be read", async () => {
    expect(await (await GET()).json()).toEqual({ label: "Player 4F2A", handle: null });
    mocks.readOwnHandle.mockRejectedValue(new Error("down"));
    expect((await GET()).status).toBe(503);
  });
});
