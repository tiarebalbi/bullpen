import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { authBaseUrl } from "./server.js";

export interface VerifiedToken {
  /** The `sub` claim: the user's id in Neon Auth. */
  userId: string;
}

/**
 * Checks a Neon Auth access token against the project's public keys and returns who it is for, or null for anything that is not a valid,
 * unexpired token signed by those keys. It never throws: a bad token is a signed-out visitor, not an error page.
 */
export async function verifyAccessToken(token: string, keys: JWTVerifyGetKey): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, keys, { requiredClaims: ["sub", "exp"], clockTolerance: 5 });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

let remote: JWTVerifyGetKey | undefined;

/** The project's public keys, fetched from its JWKS endpoint (`<auth URL>/.well-known/jwks.json`) and cached by jose. */
export function projectKeys(): JWTVerifyGetKey {
  const base = authBaseUrl();
  if (!base) throw new Error("Sign-in is not configured.");
  remote ??= createRemoteJWKSet(new URL(`${base.replace(/\/$/, "")}/.well-known/jwks.json`));
  return remote;
}
