import { neutralHandle } from "@bullpen/db-trading";
import { neonAuth } from "./server.js";

/** Who is signed in, as the app may show them: an id for the database and a neutral label. Never a name, an email or a login. */
export interface Player {
  userId: string;
  label: string;
}

/** The part of the SDK's `getSession()` result this reads: the user, present only when the SDK accepted the session. */
interface SessionResult {
  data: { session?: unknown; user?: { id?: unknown } | null } | null;
}

export interface PlayerDeps {
  getSession(): Promise<SessionResult>;
}

const live: PlayerDeps = { getSession: async () => (await neonAuth()).getSession() as unknown as SessionResult };

/**
 * The signed-in player, or null. The id is the user id from the SDK's own `getSession()`, which has already checked the session cookie's signature
 * (HS256, with `NEON_AUTH_COOKIE_SECRET`) and its expiry, or asked Neon Auth about the session token. That cookie carries the session and the user, not
 * an access token, and is not signed with the project's JWKS keys: checking it against them would refuse every session (ADR-0022).
 */
export async function currentPlayer(deps: PlayerDeps = live): Promise<Player | null> {
  let data: SessionResult["data"];
  try {
    data = (await deps.getSession()).data;
  } catch {
    return null;
  }
  const userId = data?.session ? data.user?.id : undefined;
  return typeof userId === "string" && userId.length > 0 ? { userId, label: neutralHandle(userId) } : null;
}
