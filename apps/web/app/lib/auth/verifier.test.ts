import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../../proxy.js";
import { SESSION_VERIFIER_PARAM, exchangeSessionVerifier } from "./verifier.js";

const BASE = "https://auth.example.test/neondb/auth";
const HOME = "https://bullpen-app.tiarebalbi.com";
const CHALLENGE = "__Secure-neon-auth.session_challenge=challenge-value";
const SESSION_COOKIE = "__Secure-neon-auth.session_token";

const upstreamSession = (): Response =>
  new Response(JSON.stringify({ session: { id: "s1", userId: "u1", token: "t", expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, user: { id: "u1" } }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": `${SESSION_COOKIE}=signed-token; Path=/; HttpOnly; Secure; SameSite=Lax` },
  });

const request = (path: string, cookie?: string): NextRequest => new NextRequest(`${HOME}${path}`, { headers: cookie ? { cookie } : {} });
const fetcher = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("NEON_AUTH_BASE_URL", BASE);
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "a-test-only-secret-that-is-at-least-32-characters");
  vi.stubEnv("VERCEL_ENV", "production");
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("finishing a sign-in", () => {
  it("a request that carries the verifier ends with the session cookie set and the parameter gone from the address", async () => {
    fetcher.mockImplementation(async () => upstreamSession());
    const response = await exchangeSessionVerifier(request(`/?${SESSION_VERIFIER_PARAM}=one-time-proof`, CHALLENGE));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(HOME);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.has(SESSION_VERIFIER_PARAM)).toBe(false);
    expect(location.search).toBe("");

    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(true);
    expect(cookies.every((c) => /;\s*Secure/i.test(c))).toBe(true);
    // The exchange is a call to Neon Auth that carries the verifier, which is what turns it into a session.
    const [url] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain(BASE);
    expect(String(url)).toContain(`${SESSION_VERIFIER_PARAM}=one-time-proof`);
  });

  it("keeps the rest of the address: other parameters survive, only the verifier goes", async () => {
    fetcher.mockImplementation(async () => upstreamSession());
    const response = await exchangeSessionVerifier(request(`/?ref=blog&${SESSION_VERIFIER_PARAM}=proof`, CHALLENGE));
    expect(new URL(response.headers.get("location")!).search).toBe("?ref=blog");
  });

  it("a request without the verifier is let through untouched, signed in or not: the home page is public", async () => {
    const response = await exchangeSessionVerifier(request("/"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("a verifier from a browser that did not start the sign-in (no challenge cookie) gets no session and no redirect", async () => {
    const response = await exchangeSessionVerifier(request(`/?${SESSION_VERIFIER_PARAM}=proof`));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("when Neon Auth refuses the verifier the request goes through with no session cookie, and is not sent to a login page", async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ error: "invalid verifier" }), { status: 401, headers: { "content-type": "application/json" } }));
    const response = await exchangeSessionVerifier(request(`/?${SESSION_VERIFIER_PARAM}=bad`, CHALLENGE));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("does nothing where sign-in is not available (a preview, or no settings)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const preview = await exchangeSessionVerifier(request(`/?${SESSION_VERIFIER_PARAM}=proof`, CHALLENGE));
    expect(preview.headers.get("location")).toBeNull();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
    const unconfigured = await exchangeSessionVerifier(request(`/?${SESSION_VERIFIER_PARAM}=proof`, CHALLENGE));
    expect(unconfigured.headers.get("location")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("where the proxy runs", () => {
  it("only for a request that carries the verifier, on any path", () => {
    expect(config.matcher).toEqual([{ source: "/:path*", has: [{ type: "query", key: SESSION_VERIFIER_PARAM }] }]);
  });
});
