import { NextResponse, type NextRequest } from "next/server";
import { authBaseUrl, authCookieSecret, signInAvailable } from "./server.js";

/** What GitHub's return trip leaves in the address: Neon Auth's one-time proof that this browser started the sign-in. */
export const SESSION_VERIFIER_PARAM = "neon_auth_session_verifier";

/**
 * Finishes a sign-in. The browser comes back from GitHub and Neon to `/?neon_auth_session_verifier=…`; the session cookie exists only after that
 * verifier is exchanged with Neon Auth, and the SDK does the exchange in its middleware, never in the route handler. So this runs, through `proxy.ts`, only
 * for a request that carries the verifier: it exchanges it, sets the session cookies on a redirect to the same address without the parameter, and
 * otherwise lets the request through. Nothing is protected here: the home page stays public and the order routes ask for the session themselves.
 */
export async function exchangeSessionVerifier(request: NextRequest): Promise<NextResponse> {
  const baseUrl = authBaseUrl();
  const cookieSecret = authCookieSecret();
  if (!signInAvailable() || !baseUrl || !cookieSecret || !request.nextUrl.searchParams.has(SESSION_VERIFIER_PARAM)) return NextResponse.next();

  const { processAuthMiddleware } = await import("@neondatabase/auth/server");
  const pathname = request.nextUrl.pathname;
  // This path is the only one skipped, so the SDK never asks for a login: it exchanges the verifier, or lets the request through.
  const result = await processAuthMiddleware({ request, pathname, skipRoutes: [pathname], loginUrl: "/auth/sign-in", baseUrl, cookieSecret });
  if (result.action !== "redirect_oauth") return NextResponse.next();

  const headers = new Headers();
  for (const cookie of result.cookies) headers.append("Set-Cookie", cookie);
  headers.set("cache-control", "no-store");
  return NextResponse.redirect(result.redirectUrl, { headers });
}
