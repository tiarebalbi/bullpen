import { ensurePlayerAccount } from "@bullpen/db-trading";
import type { ApiError } from "@bullpen/contracts";
import { currentPlayer, type Player } from "../auth/player.js";
import { signInAvailable } from "../auth/server.js";
import { tradingPool } from "./pool.js";

export const noStore = { "cache-control": "no-store" };

export function apiError(status: number, body: ApiError): Response {
  return Response.json(body, { status, headers: noStore });
}

const MAX_LOGGED_MESSAGE = 300;

/**
 * Says in the function log why a request failed, since the answer to the player deliberately does not. One JSON line: where, the error's name,
 * its code (a Postgres SQLSTATE, say) and a cut message. Never the player's id, and never anything from the request.
 */
export function logFailure(at: string, error: unknown): void {
  const failure = error instanceof Error ? error : new Error(String(error));
  const code = (failure as { code?: unknown }).code;
  console.error(JSON.stringify({ at, name: failure.name, ...(typeof code === "string" ? { code } : {}), message: failure.message.slice(0, MAX_LOGGED_MESSAGE) }));
}

export type Resolved = { ok: true; accountId: string; player: Player } | { ok: false; response: Response };

export interface ResolveDeps {
  signInAvailable(): boolean;
  currentPlayer(): Promise<Player | null>;
  ensureAccount(userId: string): Promise<{ accountId: string }>;
}

const live: ResolveDeps = { signInAvailable, currentPlayer: () => currentPlayer(), ensureAccount: (userId) => ensurePlayerAccount(tradingPool(), userId) };

/**
 * Who is asking, and which account is theirs. A visitor who is not signed in gets a 401 that says to sign in; where sign-in is not available (a
 * preview, or unconfigured) the 503 says that instead, so the ticket can explain rather than show a form that cannot work.
 */
export async function resolvePlayer(deps: ResolveDeps = live): Promise<Resolved> {
  if (!deps.signInAvailable()) return { ok: false, response: apiError(503, { error: "sign-in-unavailable", message: "Sign-in is not available here, so orders cannot be placed." }) };
  const player = await deps.currentPlayer();
  if (!player) return { ok: false, response: apiError(401, { error: "sign-in-required", message: "Sign in with GitHub to place an order." }) };
  try {
    return { ok: true, accountId: (await deps.ensureAccount(player.userId)).accountId, player };
  } catch (error) {
    logFailure("resolvePlayer", error);
    return { ok: false, response: apiError(503, { error: "unavailable", message: "I cannot reach the account right now. Try again in a moment." }) };
  }
}
