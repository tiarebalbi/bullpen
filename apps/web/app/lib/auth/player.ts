import type { JWTVerifyGetKey } from "jose";
import { neutralHandle } from "@bullpen/db-trading";
import { neonAuth } from "./server.js";
import { projectKeys, verifyAccessToken } from "./token.js";

/** Who is signed in, as the app may show them: an id for the database and a neutral label. Never a name, an email or a login. */
export interface Player {
  userId: string;
  label: string;
}

interface SessionResult {
  data: { session?: { access_token?: string } | null } | null;
}

export interface PlayerDeps {
  getSession(): Promise<SessionResult>;
  keys(): JWTVerifyGetKey;
}

const live: PlayerDeps = { getSession: async () => (await neonAuth()).getSession() as unknown as SessionResult, keys: projectKeys };

/**
 * The signed-in player, or null. The session says who the user is; the access token inside it is checked against the project's own keys, so
 * the id comes from a verified token and not from a cookie that was merely present.
 */
export async function currentPlayer(deps: PlayerDeps = live): Promise<Player | null> {
  let token: string | undefined;
  try {
    token = (await deps.getSession()).data?.session?.access_token;
  } catch {
    return null;
  }
  if (!token) return null;
  const verified = await verifyAccessToken(token, deps.keys());
  return verified ? { userId: verified.userId, label: neutralHandle(verified.userId) } : null;
}
