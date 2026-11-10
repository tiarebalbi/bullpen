import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInAvailable: vi.fn(),
  currentPlayer: vi.fn(),
  resolveReview: vi.fn(),
  revokeHandle: vi.fn(),
  dismissReports: vi.fn(),
  readStuckPending: vi.fn(),
  recordDecision: vi.fn(),
  submitHandle: vi.fn(),
  askGateway: vi.fn(),
  admins: { list: ["admin-1"] as string[] },
}));
vi.mock("../../../../lib/auth/server.js", () => ({ signInAvailable: mocks.signInAvailable }));
vi.mock("../../../../lib/auth/player.js", () => ({ currentPlayer: mocks.currentPlayer }));
vi.mock("../../../../lib/handles/pool.js", () => ({ handlesPool: () => ({}) }));
vi.mock("@bullpen/db-handles", () => ({ resolveReview: mocks.resolveReview, revokeHandle: mocks.revokeHandle, dismissReports: mocks.dismissReports, readStuckPending: mocks.readStuckPending, recordDecision: mocks.recordDecision, submitHandle: mocks.submitHandle }));
vi.mock("../../../../lib/handles/admins.js", () => ({ isHandleAdmin: (id: string) => mocks.admins.list.includes(id) }));
vi.mock("../../../../lib/moderation/gateway.js", () => ({ askGateway: mocks.askGateway }));

const { POST } = await import("./route.js");
const ID = "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11";
const call = (id: string, body: unknown) => POST(new Request(`http://x/api/admin/handles/${id}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const m of [mocks.signInAvailable, mocks.currentPlayer, mocks.resolveReview, mocks.revokeHandle, mocks.dismissReports, mocks.readStuckPending, mocks.recordDecision, mocks.submitHandle, mocks.askGateway]) m.mockReset();
  mocks.signInAvailable.mockReturnValue(true);
  mocks.currentPlayer.mockResolvedValue({ userId: "admin-1", label: "Player 0000" });
  mocks.resolveReview.mockResolvedValue(true);
  mocks.revokeHandle.mockResolvedValue(true);
  mocks.dismissReports.mockResolvedValue(true);
  mocks.readStuckPending.mockResolvedValue({ handleId: ID, handle: "StuckOne", submittedAt: new Date() });
  mocks.recordDecision.mockResolvedValue(true);
  mocks.askGateway.mockResolvedValue({ ok: true, probability: 0.99, costUsd: 0, latencyMs: 10 });
});

describe("the review route", () => {
  it("answers anyone not on the allowlist with a 404, and decides and asks nothing", async () => {
    mocks.currentPlayer.mockResolvedValue({ userId: "someone-else", label: "Player 1111" });
    for (const action of ["approve", "reject", "retry", "revoke", "dismiss"]) expect((await call(ID, { action })).status).toBe(404);
    expect(mocks.resolveReview).not.toHaveBeenCalled();
    expect(mocks.revokeHandle).not.toHaveBeenCalled();
    expect(mocks.dismissReports).not.toHaveBeenCalled();
    expect(mocks.askGateway).not.toHaveBeenCalled();
  });

  it("answers a visitor who is not signed in with 401", async () => {
    mocks.currentPlayer.mockResolvedValue(null);
    expect((await call(ID, { action: "approve" })).status).toBe(401);
  });

  it("approves or rejects a handle for the admin", async () => {
    expect((await call(ID, { action: "approve" })).status).toBe(200);
    expect(mocks.resolveReview).toHaveBeenLastCalledWith({}, ID, "approve");
    expect((await call(ID, { action: "reject" })).status).toBe(200);
    expect(mocks.resolveReview).toHaveBeenLastCalledWith({}, ID, "reject");
    expect(mocks.askGateway).not.toHaveBeenCalled();
  });

  it("revokes a reported handle for the admin, and asks nothing of the model", async () => {
    const response = await call(ID, { action: "revoke" });
    expect(response.status).toBe(200);
    expect(mocks.revokeHandle).toHaveBeenCalledWith({}, ID);
    expect(mocks.resolveReview).not.toHaveBeenCalled();
    expect(mocks.askGateway).not.toHaveBeenCalled();
  });

  it("says a handle is no longer approved when it was changed or taken down already", async () => {
    mocks.revokeHandle.mockResolvedValue(false);
    const response = await call(ID, { action: "revoke" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "already-decided" });
  });

  it("dismisses the reports of a handle for the admin, and says when there are none open", async () => {
    expect((await call(ID, { action: "dismiss" })).status).toBe(200);
    expect(mocks.dismissReports).toHaveBeenCalledWith({}, ID);
    expect(mocks.revokeHandle).not.toHaveBeenCalled();
    mocks.dismissReports.mockResolvedValue(false);
    expect((await call(ID, { action: "dismiss" })).status).toBe(409);
  });

  it("answers a failure to revoke with a 503 in words", async () => {
    mocks.revokeHandle.mockRejectedValue(new Error("db down"));
    const response = await call(ID, { action: "revoke" });
    expect(response.status).toBe(503);
  });

  it("refuses an id or action it does not understand", async () => {
    expect((await call("not-a-uuid", { action: "approve" })).status).toBe(400);
    expect((await call(ID, { action: "delete" })).status).toBe(400);
    expect((await call(ID, null)).status).toBe(400);
    expect(mocks.resolveReview).not.toHaveBeenCalled();
  });

  it("says 409 when the handle is no longer waiting, and 503 when the database fails", async () => {
    mocks.resolveReview.mockResolvedValueOnce(false);
    expect((await call(ID, { action: "approve" })).status).toBe(409);
    mocks.resolveReview.mockRejectedValueOnce(new Error("down"));
    expect((await call(ID, { action: "approve" })).status).toBe(503);
  });
});

describe("retrying a stuck handle", () => {
  it("asks the model again about that handle and records the verdict, without saving or counting a change", async () => {
    const response = await call(ID, { action: "retry" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "approved" });
    expect(mocks.askGateway).toHaveBeenCalledExactlyOnceWith("StuckOne");
    expect(mocks.recordDecision).toHaveBeenCalledWith({}, expect.objectContaining({ handleId: ID, handle: "StuckOne", outcome: "approved", probability: 0.99 }));
    expect(mocks.submitHandle).not.toHaveBeenCalled();
  });

  it("puts a handle in review when the model fails again, like any failure", async () => {
    mocks.askGateway.mockResolvedValue({ ok: false, reason: "timeout", latencyMs: 2000 });
    expect(await (await call(ID, { action: "retry" })).json()).toEqual({ ok: true, status: "review" });
    expect(mocks.recordDecision).toHaveBeenCalledWith({}, expect.objectContaining({ outcome: "review", reason: "timeout" }));
  });

  it("says 409 and asks no model when the handle is not stuck any more", async () => {
    mocks.readStuckPending.mockResolvedValue(null);
    const response = await call(ID, { action: "retry" });
    expect(response.status).toBe(409);
    expect(mocks.askGateway).not.toHaveBeenCalled();
    expect(mocks.recordDecision).not.toHaveBeenCalled();
  });
});
