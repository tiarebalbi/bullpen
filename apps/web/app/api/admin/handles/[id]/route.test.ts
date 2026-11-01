import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signInAvailable: vi.fn(), currentPlayer: vi.fn(), resolveReview: vi.fn(), admins: { list: ["admin-1"] as string[] } }));
vi.mock("../../../../lib/auth/server.js", () => ({ signInAvailable: mocks.signInAvailable }));
vi.mock("../../../../lib/auth/player.js", () => ({ currentPlayer: mocks.currentPlayer }));
vi.mock("../../../../lib/handles/pool.js", () => ({ handlesPool: () => ({}) }));
vi.mock("@bullpen/db-handles", () => ({ resolveReview: mocks.resolveReview }));
vi.mock("../../../../lib/handles/admins.js", () => ({ isHandleAdmin: (id: string) => mocks.admins.list.includes(id) }));

const { POST } = await import("./route.js");
const ID = "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11";
const call = (id: string, body: unknown) => POST(new Request(`http://x/api/admin/handles/${id}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const m of [mocks.signInAvailable, mocks.currentPlayer, mocks.resolveReview]) m.mockReset();
  mocks.signInAvailable.mockReturnValue(true);
  mocks.currentPlayer.mockResolvedValue({ userId: "admin-1", label: "Player 0000" });
  mocks.resolveReview.mockResolvedValue(true);
});

describe("the review route", () => {
  it("answers anyone not on the allowlist with a 404, and decides nothing", async () => {
    mocks.currentPlayer.mockResolvedValue({ userId: "someone-else", label: "Player 1111" });
    expect((await call(ID, { action: "approve" })).status).toBe(404);
    expect(mocks.resolveReview).not.toHaveBeenCalled();
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
  });

  it("refuses an id or action it does not understand", async () => {
    expect((await call("not-a-uuid", { action: "approve" })).status).toBe(400);
    expect((await call(ID, { action: "delete" })).status).toBe(400);
    expect((await call(ID, null)).status).toBe(400);
    expect(mocks.resolveReview).not.toHaveBeenCalled();
  });

  it("says 409 when the handle is no longer in review, and 503 when the database fails", async () => {
    mocks.resolveReview.mockResolvedValueOnce(false);
    expect((await call(ID, { action: "approve" })).status).toBe(409);
    mocks.resolveReview.mockRejectedValueOnce(new Error("down"));
    expect((await call(ID, { action: "approve" })).status).toBe(503);
  });
});
