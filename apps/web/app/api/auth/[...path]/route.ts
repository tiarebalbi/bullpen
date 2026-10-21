import { neonAuth, signInAvailable } from "../../../lib/auth/server.js";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const off = (): Response => Response.json({ error: "Sign-in is not available here." }, { status: 404, headers: { "cache-control": "no-store" } });

/** Neon Auth's proxy: the sign-in redirects and the session calls go through here. Closed on a preview and when sign-in is not configured. */
export async function GET(request: Request, context: Context): Promise<Response> {
  return signInAvailable() ? (await neonAuth()).handler().GET(request, context) : off();
}

export async function POST(request: Request, context: Context): Promise<Response> {
  return signInAvailable() ? (await neonAuth()).handler().POST(request, context) : off();
}
