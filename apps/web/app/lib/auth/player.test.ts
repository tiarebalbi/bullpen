// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { neutralHandle } from "@bullpen/db-trading";

// Only the request's cookies are faked: the SDK, its cookie minting and its session check are the real ones from @neondatabase/auth, so the cookie
// under test is the one the SDK writes in production and not a token this file signed (the failure that shipped: a hand-signed JWKS token passed here,
// while the SDK's own HS256 session cookie was refused in production).
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => undefined }),
  headers: async () => new Headers({ cookie: request.cookie }),
}));

const BASE_URL = "https://auth.example.test/db/auth";
const SECRET = "test-cookie-secret-".padEnd(40, "x");
const SESSION_TOKEN_COOKIE = "__Secure-neon-auth.session_token=opaque-session-token";

const upstreamSession = {
  session: { id: "s-1", userId: "user-abc", token: "opaque-session-token", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  user: { id: "user-abc", name: "Ada Lovelace", email: "ada@example.org", image: "https://avatars.example.test/ada.png", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
};

const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

/** What the SDK sets after a sign-in: its own proxy asks Neon Auth (faked here) for the session and writes the `session_data` cookie. */
async function mintSessionDataCookie(secret: string): Promise<string> {
  const { handleAuthProxyRequest } = await import("@neondatabase/auth/server");
  const response = await handleAuthProxyRequest({
    request: new Request("https://bullpen.example.test/api/auth/get-session", { headers: { cookie: SESSION_TOKEN_COOKIE } }),
    path: "get-session",
    baseUrl: BASE_URL,
    cookieSecret: secret,
  });
  const header = response.headers.getSetCookie().find((cookie) => cookie.includes("session_data"));
  if (!header) throw new Error("the SDK did not set a session_data cookie");
  return header.split(";")[0]!;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEON_AUTH_BASE_URL", BASE_URL);
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", SECRET);
  // Neon Auth knows a session only by its session token.
  upstream.mockImplementation(async (_url, init) => Response.json(new Headers(init?.headers).get("cookie")?.includes("opaque-session-token") ? upstreamSession : null));
  vi.stubGlobal("fetch", upstream);
  request.cookie = "";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("currentPlayer, with the cookies the Neon Auth SDK really writes", () => {
  it("is the user in the SDK's session cookie, signed with the cookie secret, without asking Neon Auth again", async () => {
    const sessionData = await mintSessionDataCookie(SECRET);
    // The cookie in the incident: HS256, signed with NEON_AUTH_COOKIE_SECRET. It is not an access token, so it can never verify against the JWKS.
    const header = JSON.parse(Buffer.from(sessionData.split("=")[1]!.split(".")[0]!, "base64url").toString());
    expect(header).toMatchObject({ alg: "HS256", typ: "JWT" });

    upstream.mockClear();
    request.cookie = `${SESSION_TOKEN_COOKIE}; ${sessionData}`;
    const { currentPlayer } = await import("./player.js");
    const player = await currentPlayer();

    expect(player).toEqual({ userId: "user-abc", label: neutralHandle("user-abc") });
    expect(player!.label).toMatch(/^Player [0-9A-F]{4}$/);
    expect(JSON.stringify(player)).not.toMatch(/Ada|Lovelace|ada@example|avatars/);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("is null for a session cookie signed with another secret when Neon Auth does not know the session either", async () => {
    const forged = await mintSessionDataCookie("some-other-secret-".padEnd(40, "y"));
    upstream.mockClear();
    upstream.mockImplementation(async () => Response.json(null));
    request.cookie = `${SESSION_TOKEN_COOKIE}; ${forged}`;
    const { currentPlayer } = await import("./player.js");
    expect(await currentPlayer()).toBeNull();
    expect(upstream).toHaveBeenCalled(); // the SDK refused the cookie and asked Neon Auth, which said no: not a failure to load the SDK
  });

  it("is null for a visitor with no cookies, and when Neon Auth cannot be reached", async () => {
    const { currentPlayer } = await import("./player.js");
    expect(await currentPlayer()).toBeNull();

    request.cookie = SESSION_TOKEN_COOKIE;
    upstream.mockClear();
    upstream.mockImplementation(async () => Promise.reject(new Error("upstream down")));
    expect(await currentPlayer()).toBeNull();
    expect(upstream).toHaveBeenCalled();
  });

  it("is null when sign-in is not configured", async () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
    const { currentPlayer } = await import("./player.js");
    expect(await currentPlayer()).toBeNull();
  });
});

describe("currentPlayer, on the shape of the result", () => {
  const withSession = async (data: unknown) => (await import("./player.js")).currentPlayer({ getSession: async () => ({ data: data as never }) });

  it("needs both a session and a user id", async () => {
    expect(await withSession(null)).toBeNull();
    expect(await withSession({ session: null, user: null })).toBeNull();
    expect(await withSession({ session: {}, user: {} })).toBeNull();
    expect(await withSession({ session: {}, user: { id: "" } })).toBeNull();
    expect(await withSession({ user: { id: "user-abc" } })).toBeNull();
    expect(await withSession({ session: {}, user: { id: "user-abc" } })).toEqual({ userId: "user-abc", label: neutralHandle("user-abc") });
  });
});
