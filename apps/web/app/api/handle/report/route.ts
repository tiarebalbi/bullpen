import { reportHandle } from "@bullpen/db-handles";
import { handlesPool } from "../../../lib/handles/pool.js";
import { handleError, logHandleFailure, noStore } from "../../../lib/handles/respond.js";
import { requirePlayer } from "../../../lib/handles/session.js";
import { checkHandle } from "../../../lib/moderation/rules.js";

export const dynamic = "force-dynamic";

/**
 * A signed-in player's report of another player's handle, named as the leaderboard shows it. One report for each player and handle: a second is a 409, and so is a report of
 * your own handle. Only an approved handle can be reported (it is the only kind anyone sees), and one that is not, or is not shown any more, is a 404. The report stores the
 * handle's id and the reporter's user id and the time; the body carries the name and nothing else, and nothing the reporter says is kept. It changes nothing for anyone by itself:
 * a person decides on /admin/handles.
 */
export async function POST(request: Request): Promise<Response> {
  const who = await requirePlayer();
  if (!who.ok) return who.response;
  const body: unknown = await request.json().catch(() => null);
  const checked = checkHandle(typeof body === "object" && body !== null ? (body as { handle?: unknown }).handle : undefined);
  if (!checked.ok) return handleError(400, { error: "invalid-handle", message: "That is not a handle I can report." });

  try {
    const result = await reportHandle(handlesPool(), who.player.userId, checked.handle);
    if (result.ok) return Response.json({ ok: true }, { headers: noStore });
    if (result.reason === "own") return handleError(409, { error: "own-handle", message: "That is your own handle." });
    if (result.reason === "already") return handleError(409, { error: "already-reported", message: "You have already reported that handle." });
    return handleError(404, { error: "not-found", message: "That handle is not shown on the leaderboard any more." });
  } catch (error) {
    logHandleFailure("handle.report.POST", error);
    return handleError(503, { error: "unavailable", message: "I could not record that. Try again in a moment." });
  }
}
