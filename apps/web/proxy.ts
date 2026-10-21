import type { NextRequest } from "next/server";
import { exchangeSessionVerifier } from "./app/lib/auth/verifier.js";

/** Next 16's proxy (the middleware of earlier versions). It runs only for the one request that finishes a sign-in; see app/lib/auth/verifier.ts. */
export function proxy(request: NextRequest): Promise<Response> {
  return exchangeSessionVerifier(request);
}

export const config = {
  matcher: [{ source: "/:path*", has: [{ type: "query", key: "neon_auth_session_verifier" }] }],
};
