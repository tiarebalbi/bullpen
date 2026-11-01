import { beforeEach, describe, expect, it, vi } from "vitest";

const serve = vi.fn();
const signedIn = vi.fn();
const player = vi.fn();
const findAccount = vi.fn();
const readOwn = vi.fn();
vi.mock("@bullpen/db-trading", () => ({ serveLeaderboard: (...args: unknown[]) => serve(...args), findPlayerAccount: (...args: unknown[]) => findAccount(...args) }));
vi.mock("@bullpen/db-handles", () => ({ readOwnHandle: (...args: unknown[]) => readOwn(...args) }));
vi.mock("../../lib/trading/pool.js", () => ({ tradingPool: () => ({}) }));
vi.mock("../../lib/handles/pool.js", () => ({ handlesPool: () => ({}) }));
vi.mock("../../lib/auth/server.js", () => ({ signInAvailable: () => signedIn() }));
vi.mock("../../lib/auth/player.js", () => ({ currentPlayer: () => player() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (work: () => unknown) => void work }));

const { GET } = await import("./route.js");

const read = { rows: [{ accountId: "a", handle: "ada", cash: "1", positionsValue: "0", equity: "1", rank: 1 }], total: 812, asOf: new Date("2026-10-16T12:00:00Z"), ageMs: 1000, stale: false, lastFailure: null };
const UUID = "0b9b1a1e-6d5c-4a5e-9b0c-6a2f4f6d9f11";

describe("GET /api/leaderboard", () => {
  beforeEach(() => {
    // Braces: a function returned from beforeEach is run as its cleanup, and the mock would be called again.
    serve.mockReset().mockResolvedValue(read);
    signedIn.mockReset().mockReturnValue(false);
    player.mockReset().mockResolvedValue(null);
    findAccount.mockReset().mockResolvedValue(null);
    readOwn.mockReset().mockResolvedValue(null);
  });

  it("returns what the read gives, with the number of ranked accounts, and caches nothing", async () => {
    const response = await GET(new Request("http://x/api/leaderboard"));
    const body = await response.json();
    expect(body).toMatchObject({ total: 812, stale: false, asOf: "2026-10-16T12:00:00.000Z" });
    expect(body.rows).toHaveLength(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("asks for no more than the cap: it passes no limit above the one the read enforces", async () => {
    await GET(new Request("http://x/api/leaderboard"));
    expect(serve.mock.calls[0]![1].read).toEqual({ accountId: undefined });
  });

  it("passes the caller's account to the read when it is a uuid, and ignores anything else", async () => {
    await GET(new Request(`http://x/api/leaderboard?account=${UUID}`));
    expect(serve.mock.calls[0]![1].read).toEqual({ accountId: UUID });
    await GET(new Request("http://x/api/leaderboard?account=1%3B%20DROP%20TABLE%20x"));
    expect(serve.mock.calls[1]![1].read).toEqual({ accountId: undefined });
  });

  it("answers 503 when the database is unavailable, without the error text", async () => {
    serve.mockImplementation(async () => {
      throw new Error("password authentication failed for user x");
    });
    const response = await GET(new Request("http://x/api/leaderboard"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("password");
  });

  describe("the viewer: who is asking, for them alone", () => {
    const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
    const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
    const SECRET = "SecretName99";
    // The handles owner, as a store of two players: only A has a handle, and it is in review.
    const handles: Record<string, { handle: string; status: string }> = { "user-a": { handle: SECRET, status: "review" } };
    const accounts: Record<string, string> = { "user-a": ACCOUNT_A, "user-b": ACCOUNT_B };
    const sessionOf = (userId: string | null) => {
      signedIn.mockReturnValue(true);
      player.mockResolvedValue(userId ? { userId, label: "Player ####" } : null);
      findAccount.mockImplementation(async (_pool: unknown, id: string) => (accounts[id] ? { accountId: accounts[id] } : null));
      readOwn.mockImplementation(async (_pool: unknown, id: string) => handles[id] ?? null);
    };
    const bodyAs = async (userId: string | null) => {
      sessionOf(userId);
      const text = await (await GET(new Request("http://x/api/leaderboard"))).text();
      return { text, json: JSON.parse(text) as { viewer?: unknown } };
    };

    it("tells the player their own handle's status and account, and never the text of a handle that is not approved", async () => {
      const { text, json } = await bodyAs("user-a");
      expect(json.viewer).toEqual({ accountId: ACCOUNT_A, handle: { status: "review", approved: null } });
      expect(text).not.toContain(SECRET);
      expect(serve.mock.calls[0]![1].read).toEqual({ accountId: ACCOUNT_A });
    });

    it("tells a second player nothing about the first player's handle: no status, no text, only their own account", async () => {
      const { text, json } = await bodyAs("user-b");
      expect(json.viewer).toEqual({ accountId: ACCOUNT_B, handle: null });
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(ACCOUNT_A);
      expect(text).not.toContain("review");
    });

    it("tells a visitor nothing: no viewer at all, and no handle text", async () => {
      const { text, json } = await bodyAs(null);
      expect(json.viewer).toBeUndefined();
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("review");
    });

    it("shows no viewer where sign-in is not available, and asks nothing of the handles owner", async () => {
      const response = await GET(new Request("http://x/api/leaderboard"));
      expect((await response.json()).viewer).toBeUndefined();
      expect(readOwn).not.toHaveBeenCalled();
    });

    it("does not let a request name whose status it wants: the account param only adds a public row, and a visitor still gets no viewer", async () => {
      sessionOf(null);
      const response = await GET(new Request(`http://x/api/leaderboard?account=${ACCOUNT_A}&viewer=${ACCOUNT_A}`));
      const text = await response.text();
      expect(JSON.parse(text).viewer).toBeUndefined();
      expect(text).not.toContain(SECRET);
      expect(readOwn).not.toHaveBeenCalled();
    });

    it("gives the handle's text for an approved handle, which is public on the ranking already", async () => {
      handles["user-a"] = { handle: "ada", status: "approved" };
      const { json } = await bodyAs("user-a");
      expect(json.viewer).toEqual({ accountId: ACCOUNT_A, handle: { status: "approved", approved: "ada" } });
      handles["user-a"] = { handle: SECRET, status: "review" };
    });

    it("still serves the ranking, with the caller known by their account, when their handle cannot be read", async () => {
      sessionOf("user-a");
      readOwn.mockRejectedValue(new Error("connection refused"));
      const response = await GET(new Request("http://x/api/leaderboard"));
      expect(response.status).toBe(200);
      expect((await response.json()).viewer).toEqual({ accountId: ACCOUNT_A, handle: null });
    });

    it("still serves the ranking, with no viewer, when the account cannot be looked up", async () => {
      sessionOf("user-a");
      findAccount.mockRejectedValue(new Error("connection refused"));
      const response = await GET(new Request("http://x/api/leaderboard"));
      expect(response.status).toBe(200);
      expect((await response.json()).viewer).toBeUndefined();
    });
  });
});
