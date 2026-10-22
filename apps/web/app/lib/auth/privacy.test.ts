// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountView } from "@bullpen/contracts";

// The whole sign-in path is real (the SDK's own session cookie, currentPlayer, resolvePlayer, the route); only the cookies of the request and the
// database are faked. The session cookie carries the user's name, email and image, as the SDK's does in production: none of it may leave the server.
const request = vi.hoisted(() => ({ cookie: "" }));
const db = vi.hoisted(() => ({ ensurePlayerAccount: vi.fn(), advanceAccount: vi.fn(), readAccountView: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => undefined }), headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("../trading/pool.js", () => ({ tradingPool: () => ({}) }));
vi.mock("@bullpen/db-trading", async (importOriginal) => ({ ...(await importOriginal<typeof import("@bullpen/db-trading")>()), ...db }));

const BASE_URL = "https://auth.example.test/db/auth";
const SECRET = "test-cookie-secret-".padEnd(40, "x");
const SESSION_TOKEN_COOKIE = "__Secure-neon-auth.session_token=opaque-session-token";
const now = () => new Date().toISOString();
const PII = { name: "Ada Lovelace", email: "ada@example.org", image: "https://avatars.example.test/ada.png", login: "ada-gh" };
const upstreamSession = {
  session: { id: "s-1", userId: "user-abc", token: "opaque-session-token", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: now(), updatedAt: now() },
  user: { id: "user-abc", ...PII, createdAt: now(), updatedAt: now() },
};
const view: AccountView = { label: "Player 4F2A", buyingPower: "100000.00000000", reserved: "0.00000000", cash: "100000.00000000", positionsValue: "0.00000000", equity: "100000.00000000", positions: [], orders: [], latestOrder: null, fills: [], asOf: "2026-10-21T12:00:00.000Z" };
const PII_PATTERN = /Ada|Lovelace|ada@example|avatars\.example|ada-gh/;

async function signedInCookies(): Promise<string> {
  vi.stubGlobal("fetch", async () => Response.json(upstreamSession));
  const { handleAuthProxyRequest } = await import("@neondatabase/auth/server");
  const response = await handleAuthProxyRequest({ request: new Request("https://bullpen.example.test/api/auth/get-session", { headers: { cookie: SESSION_TOKEN_COOKIE } }), path: "get-session", baseUrl: BASE_URL, cookieSecret: SECRET });
  const sessionData = response.headers.getSetCookie().find((cookie) => cookie.includes("session_data"))!.split(";")[0]!;
  return `${SESSION_TOKEN_COOKIE}; ${sessionData}`;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  for (const m of Object.values(db)) m.mockReset();
  vi.stubEnv("NEON_AUTH_BASE_URL", BASE_URL);
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", SECRET);
  vi.stubEnv("VERCEL_ENV", "production");
  db.ensurePlayerAccount.mockResolvedValue({ accountId: "acct-1" });
  db.readAccountView.mockResolvedValue(view);
});

describe("GET /api/orders with a real signed-in session", () => {
  it("answers with the account and the Player label, and nothing of the user's name, email or image", async () => {
    request.cookie = await signedInCookies();
    const { GET } = await import("../../api/orders/route.js");
    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text).label).toMatch(/^Player [0-9A-F]{4}$/);
    expect(text).not.toMatch(PII_PATTERN);
    // The database is given the user's id and nothing else about them.
    expect(JSON.stringify(db.ensurePlayerAccount.mock.calls)).toBe(JSON.stringify([[{}, "user-abc"]]));
  });

  it("keeps it out of the signed-out answer too", async () => {
    request.cookie = "";
    vi.stubGlobal("fetch", async () => Response.json(null));
    const { GET } = await import("../../api/orders/route.js");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.text()).not.toMatch(PII_PATTERN);
  });

  it("hands the rest of the app a player with an id and a label only", async () => {
    request.cookie = await signedInCookies();
    const { currentPlayer } = await import("./player.js");
    const player = await currentPlayer();
    expect(Object.keys(player!).sort()).toEqual(["label", "userId"]);
    expect(JSON.stringify(player)).not.toMatch(PII_PATTERN);
  });
});
