import { beforeEach, describe, expect, it, vi } from "vitest";

// The real allowlist, not a mock of it: the owner's account id gets through to the review page and its route, and any other id gets the 404 a missing route gets.
const OWNER = "7c48c226-1a7d-4ae1-975f-a22a746a1b0a";
const ID = "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11";

const mocks = vi.hoisted(() => ({
  signInAvailable: vi.fn(),
  currentPlayer: vi.fn(),
  resolveReview: vi.fn(),
  listReviewQueue: vi.fn(),
  listStuckPending: vi.fn(),
}));
vi.mock("../../lib/auth/server.js", () => ({ signInAvailable: mocks.signInAvailable }));
vi.mock("../../lib/auth/player.js", () => ({ currentPlayer: mocks.currentPlayer }));
vi.mock("../../lib/handles/pool.js", () => ({ handlesPool: () => ({}) }));
vi.mock("@bullpen/db-handles", () => ({
  STUCK_AFTER_MINUTES: 10,
  listReviewQueue: mocks.listReviewQueue,
  listStuckPending: mocks.listStuckPending,
  resolveReview: mocks.resolveReview,
  readStuckPending: vi.fn(),
  recordDecision: vi.fn(),
  submitHandle: vi.fn(),
}));
vi.mock("../../lib/moderation/gateway.js", () => ({ askGateway: vi.fn() }));
vi.mock("../../components/ReviewList.js", () => ({ ReviewList: () => null }));

const { default: ReviewPage } = await import("./page.js");
// Imported through the route's own module path (the dynamic segment's folder), so nothing between the request and the real allowlist is replaced.
const { POST } = await import("../../api/admin/handles/[id]/route.js");
const post = (action: string) => POST(new Request(`http://x/api/admin/handles/${ID}`, { method: "POST", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id: ID }) });
const isNotFound = (error: unknown): boolean => typeof error === "object" && error !== null && String((error as { digest?: unknown }).digest).includes("404");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const m of [mocks.signInAvailable, mocks.currentPlayer, mocks.resolveReview, mocks.listReviewQueue, mocks.listStuckPending]) m.mockReset();
  mocks.signInAvailable.mockReturnValue(true);
  mocks.listReviewQueue.mockResolvedValue([]);
  mocks.listStuckPending.mockResolvedValue([]);
  mocks.resolveReview.mockResolvedValue(true);
});

describe("the review page, with the real allowlist", () => {
  it("shows the owner's account the page", async () => {
    mocks.currentPlayer.mockResolvedValue({ userId: OWNER, label: "Player 0000" });
    await expect(ReviewPage()).resolves.toBeTruthy();
    expect(mocks.listReviewQueue).toHaveBeenCalled();
  });

  it("gives any other signed-in id the 404 a missing page gets, and reads nothing", async () => {
    for (const userId of ["someone-else", "7c48c226-1a7d-4ae1-975f-a22a746a1b0b", OWNER.toUpperCase(), `${OWNER} `]) {
      mocks.currentPlayer.mockResolvedValue({ userId, label: "Player 1111" });
      const error = await ReviewPage().then(() => null, (reason: unknown) => reason);
      expect(isNotFound(error)).toBe(true);
    }
    expect(mocks.listReviewQueue).not.toHaveBeenCalled();
    expect(mocks.listStuckPending).not.toHaveBeenCalled();
  });

  it("gives a visitor, and a build where sign-in is not available, the same 404", async () => {
    mocks.currentPlayer.mockResolvedValue(null);
    expect(isNotFound(await ReviewPage().then(() => null, (reason: unknown) => reason))).toBe(true);
    mocks.signInAvailable.mockReturnValue(false);
    mocks.currentPlayer.mockResolvedValue({ userId: OWNER, label: "Player 0000" });
    expect(isNotFound(await ReviewPage().then(() => null, (reason: unknown) => reason))).toBe(true);
  });
});

describe("the review route, with the real allowlist", () => {
  it("lets the owner's account decide a handle", async () => {
    mocks.currentPlayer.mockResolvedValue({ userId: OWNER, label: "Player 0000" });
    expect((await post("approve")).status).toBe(200);
    expect(mocks.resolveReview).toHaveBeenCalledWith({}, ID, "approve");
  });

  it("answers any other signed-in id with a 404 and decides nothing", async () => {
    for (const userId of ["someone-else", "7c48c226-1a7d-4ae1-975f-a22a746a1b0b", OWNER.toUpperCase()]) {
      mocks.currentPlayer.mockResolvedValue({ userId, label: "Player 1111" });
      for (const action of ["approve", "reject", "retry"]) expect((await post(action)).status).toBe(404);
    }
    expect(mocks.resolveReview).not.toHaveBeenCalled();
  });
});
