/** Neon Auth's URL for this project: where the sign-in proxy sends requests and where the SDK asks about a session. Null when it is not set. */
export function authBaseUrl(): string | null {
  return process.env.NEON_AUTH_BASE_URL || null;
}

async function makeAuth(baseUrl: string, secret: string) {
  // Loaded on first use: the SDK reads Next's request context, which a build, a unit test or a page that never signs in has no need of.
  const { createNeonAuth } = await import("@neondatabase/auth/next/server");
  return createNeonAuth({ baseUrl, cookies: { secret } });
}

type NeonAuth = Awaited<ReturnType<typeof makeAuth>>;

let instance: Promise<NeonAuth> | undefined;

/**
 * The Neon Auth server instance (ADR-0020), made on first use so a build never needs the secrets. Only this directory reads the two variables
 * it is made from, and nothing here prints them.
 */
export function neonAuth(): Promise<NeonAuth> {
  const baseUrl = authBaseUrl();
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) return Promise.reject(new Error("Sign-in is not configured: the Neon Auth URL and cookie secret are not both set."));
  instance ??= makeAuth(baseUrl, secret);
  return instance;
}

/** The secret that signs the session cookies, for the one place besides `neonAuth` that needs it: the exchange of a sign-in's verifier (verifier.ts). */
export function authCookieSecret(): string | null {
  return process.env.NEON_AUTH_COOKIE_SECRET || null;
}

/** No sign-in on a Vercel preview: its address changes with every deployment and is not a trusted domain of the auth project. */
export function signInAvailable(): boolean {
  return process.env.VERCEL_ENV !== "preview" && authBaseUrl() !== null && Boolean(process.env.NEON_AUTH_COOKIE_SECRET);
}
