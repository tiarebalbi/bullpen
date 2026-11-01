import { CHANGE_LIMIT, CHANGE_WINDOW_HOURS, readOwnHandle, recordDecision, submitHandle } from "@bullpen/db-handles";
import { handlesPool } from "../../lib/handles/pool.js";
import { handleError, limitMessage, logHandleFailure, noStore } from "../../lib/handles/respond.js";
import { requirePlayer } from "../../lib/handles/session.js";
import { saveAndModerate } from "../../lib/moderation/moderate.js";

export const dynamic = "force-dynamic";

const UNAVAILABLE = { error: "unavailable", message: "I cannot reach handles right now. Try again in a moment." } as const;

/** The player's own handle and its status, for the account page. Only the player ever sees a handle that is not approved. */
export async function GET(): Promise<Response> {
  const who = await requirePlayer();
  if (!who.ok) return who.response;
  try {
    const own = await readOwnHandle(handlesPool(), who.player.userId);
    return Response.json({ label: who.player.label, handle: own ? { handle: own.handle, status: own.status } : null }, { headers: noStore });
  } catch (error) {
    logHandleFailure("handle.GET", error);
    return handleError(503, UNAVAILABLE);
  }
}

/**
 * Saves a new or changed handle and moderates it. A rule that fails is a 400 and no model is asked; a name that is taken is a 409; a player who has already changed
 * their handle CHANGE_LIMIT times in the window gets a 429 with a plain message, checked before any model call, so nothing is saved and nothing is asked. Whatever moderation does,
 * including failing, the answer is 200 with where the handle stands, and the handle is never shown anywhere until it is approved.
 */
export async function POST(request: Request): Promise<Response> {
  const who = await requirePlayer();
  if (!who.ok) return who.response;
  const body: unknown = await request.json().catch(() => null);
  const input = typeof body === "object" && body !== null ? (body as { handle?: unknown }).handle : undefined;

  try {
    const pool = handlesPool();
    const outcome = await saveAndModerate(who.player.userId, input, {
      store: { submit: (userId, handle) => submitHandle(pool, userId, handle), record: (decision) => recordDecision(pool, decision) },
    });
    if (!outcome.ok && outcome.kind === "invalid") return handleError(400, { error: "invalid-handle", message: outcome.error });
    if (!outcome.ok && outcome.kind === "limit") {
      const response = handleError(429, { error: "handle-limit", message: limitMessage(CHANGE_LIMIT, CHANGE_WINDOW_HOURS, outcome.retryAfterSeconds) });
      response.headers.set("retry-after", String(outcome.retryAfterSeconds));
      return response;
    }
    if (!outcome.ok) return handleError(409, { error: "handle-taken", message: "Someone already has that handle. Try another." });
    return Response.json({ status: outcome.status }, { headers: noStore });
  } catch (error) {
    logHandleFailure("handle.POST", error);
    return handleError(503, UNAVAILABLE);
  }
}
