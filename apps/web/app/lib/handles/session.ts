import { currentPlayer, type Player } from "../auth/player.js";
import { signInAvailable } from "../auth/server.js";
import { handleError } from "./respond.js";

export type SignedIn = { ok: true; player: Player } | { ok: false; response: Response };

/** The signed-in player or the answer to give: 503 where sign-in is not available, 401 for a visitor. */
export async function requirePlayer(): Promise<SignedIn> {
  if (!signInAvailable()) return { ok: false, response: handleError(503, { error: "sign-in-unavailable", message: "Sign-in is not available here, so a handle cannot be set." }) };
  const player = await currentPlayer();
  if (!player) return { ok: false, response: handleError(401, { error: "sign-in-required", message: "Sign in with GitHub to set a handle." }) };
  return { ok: true, player };
}
